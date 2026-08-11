require "json"

require_relative "cleo_design_tokens/version"

# Reads Cleo's canonical colour design tokens (packages/tokens/tokens/color)
# into two frozen lookups, namespaced by token type then layer, with the
# theme passed alongside the key rather than baked into it.
#
#   CleoDesignTokens.colors.semantic.fetch("core.content.primary")                # => "#47201C"
#   CleoDesignTokens.colors.semantic.fetch("core.content.primary", theme: :roast) # => "#F8F6F2"
#   CleoDesignTokens.colors.primitives.fetch("brown.800")                        # => "#47201C"
module CleoDesignTokens
  class UnknownTokenError < KeyError; end
  class UnknownThemeError < StandardError; end
  class DuplicateTokenError < StandardError; end

  TOKENS_DIR = File.expand_path("../tokens/color", __dir__)
  PRIMITIVES_PATH = File.join(TOKENS_DIR, "primitives.json")
  SEMANTIC_PATH = File.join(TOKENS_DIR, "semantic.json")

  THEMES = %w[base chat roast hype].freeze

  # A leaf is `{ "$type" => "color", ... }` — matches transform-core.mjs's
  # `isLeaf` exactly. A role can carry `$themes` and no `$value` at all
  # (defined only under a theme, missing from Base in Figma), so `$value`
  # presence is never part of this check.
  def self.leaf?(node)
    node.is_a?(Hash) && node["$type"] == "color"
  end
  private_class_method :leaf?

  # Walks a token tree, skipping `$`-prefixed keys, yielding each leaf's
  # path and node to the block. Keys are the JSON path, dot-joined — the
  # files carry no `color.primitives`/`color.semantic` wrapper to strip, and
  # segments are already normalised on disk, so there's nothing left for the
  # reader to do to a path.
  def self.walk(node, path, &on_leaf)
    return unless node.is_a?(Hash)

    if leaf?(node)
      on_leaf.call(path, node)
      return
    end

    node.each do |child_key, child_value|
      next if child_key.start_with?("$")

      walk(child_value, path + [child_key], &on_leaf)
    end
  end
  private_class_method :walk

  # Flattens one token tree of plain (theme-free) leaves — e.g. the parsed
  # `primitives.json` — into a key -> hex lookup. Exposed as a function,
  # rather than baked into module load, so the collision case is testable
  # against fixtures.
  def self.build_lookup(tree)
    lookup = {}
    origins = {}
    walk(tree, []) do |path, leaf|
      key = path.join(".")
      if lookup.key?(key)
        raise DuplicateTokenError,
              "duplicate design token #{key.inspect}: defined at both " \
              "#{origins.fetch(key)} and #{path.join('.')}"
      end

      lookup[key] = leaf["$value"].dup.freeze
      origins[key] = path.join(".")
    end
    lookup
  end

  # One semantic role: its Base value (nil when the role only exists under a
  # theme) plus whatever theme overrides genuinely differ from Base.
  SemanticEntry = Struct.new(:value, :themes)

  # Flattens `semantic.json` into a key -> SemanticEntry lookup, one entry
  # per role — the theme axis lives inside the entry, not in the key.
  def self.build_semantic_lookup(tree)
    lookup = {}
    origins = {}
    walk(tree, []) do |path, leaf|
      key = path.join(".")
      if lookup.key?(key)
        raise DuplicateTokenError,
              "duplicate design token #{key.inspect}: defined at both " \
              "#{origins.fetch(key)} and #{path.join('.')}"
      end

      themes = {}
      (leaf["$themes"] || {}).each do |theme, override|
        themes[theme] = override["$value"].dup.freeze
      end

      value = leaf["$value"]
      lookup[key] = SemanticEntry.new(value && value.dup.freeze, themes.freeze).freeze
      origins[key] = path.join(".")
    end
    lookup
  end

  # Built at load, into constants — not `@lookup ||=`. The AC ("frozen and
  # safe to read from multiple threads") rules out lazy init, which is the
  # race.
  PRIMITIVES_LOOKUP = build_lookup(JSON.parse(File.read(PRIMITIVES_PATH))).freeze
  SEMANTIC_LOOKUP = build_semantic_lookup(JSON.parse(File.read(SEMANTIC_PATH))).freeze

  # Wraps one frozen lookup with a single-argument `fetch`. Exposed so tests
  # can build one over a fixture lookup, exactly like the module's own
  # `colors.primitives` below.
  class Bucket
    def initialize(lookup)
      @lookup = lookup
    end

    def fetch(key)
      @lookup.fetch(key) { raise UnknownTokenError, "unknown design token: #{key.inspect}" }
    end
  end

  # `theme:` defaults to `"base"` — `$themes` never carries a `"base"` key
  # (Base isn't an override of itself), so the default and an explicit
  # `theme: :base` resolve identically with no special-casing.
  class SemanticBucket
    def initialize(lookup)
      @lookup = lookup
    end

    def fetch(key, theme: "base")
      theme = theme.to_s
      raise UnknownThemeError, "unknown theme: #{theme.inspect}" unless THEMES.include?(theme)

      entry = @lookup.fetch(key) { raise UnknownTokenError, "unknown design token: #{key.inspect}" }
      value = resolve(entry, theme)
      if value.nil?
        raise UnknownTokenError,
              "design token #{key.inspect} has no Base value and no override for theme #{theme.inspect}"
      end

      value
    end

    private

    # What a caller gets for (role, theme): the theme's override when it has
    # one, otherwise the Base value — mirrors transform-core.mjs's
    # `resolveTheme` exactly. Returns nil when neither exists, which is what
    # makes `fetch` raise for the Base-less roles.
    def resolve(entry, theme)
      entry.themes[theme] || entry.value
    end
  end

  # Namespaced by token type (`colors`), then by layer (`primitives`,
  # `semantic`) — lowercase accessors, not `CleoDesignTokens::Colors::
  # Semantic.fetch(...)` module nesting, so the call text stays identical to
  # the TypeScript reader (a colour greps across both repos).
  Colors = Struct.new(:primitives, :semantic)
  COLORS = Colors.new(Bucket.new(PRIMITIVES_LOOKUP), SemanticBucket.new(SEMANTIC_LOOKUP)).freeze

  def self.colors
    COLORS
  end
end
