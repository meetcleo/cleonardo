require_relative "tree_walker"
require_relative "semantic_entry"
require_relative "errors"

module CleoDesignTokens
  # Flattens token trees into frozen key -> value lookups, using TreeWalker.
  # Exposed as module functions, rather than baked into module load, so the
  # collision case is testable against fixtures.
  module LookupBuilder
    # Flattens one tree of plain (theme-free) leaves — e.g. the parsed
    # `primitives.json` — into a key -> hex lookup.
    def self.build_lookup(tree)
      lookup = {}
      origins = {}
      TreeWalker.walk(tree) do |path, leaf|
        key = register(lookup, origins, path)
        lookup[key] = leaf["$value"].freeze
      end
      lookup
    end

    # Flattens `semantic.json` into a key -> SemanticEntry lookup, one entry
    # per role — the theme axis lives inside the entry, not in the key.
    def self.build_semantic_lookup(tree)
      lookup = {}
      origins = {}
      TreeWalker.walk(tree) do |path, leaf|
        key = register(lookup, origins, path)

        themes = {}
        (leaf["$themes"] || {}).each do |theme, override|
          themes[theme] = override["$value"].freeze
        end

        # `Data#new` freezes the instance itself; the Hash inside it still
        # needs its own `.freeze` — freezing is shallow.
        lookup[key] = SemanticEntry.new(leaf["$value"]&.freeze, themes.freeze)
      end
      lookup
    end

    # Raises if `path`'s key already exists in `lookup`, else records `path`
    # against it and returns the key. Shared by both builders so the
    # duplicate-detection message can't drift between them.
    #
    # `origins` maps key -> the *path array* that produced it, not the key
    # itself — two different paths can normalise to the same key (e.g. a
    # segment that itself contains a literal `.`), and storing the path
    # (rather than re-deriving the identical string) is what lets the error
    # below name both distinctly instead of printing the same string twice.
    def self.register(lookup, origins, path)
      key = path.join(".")
      if origins.key?(key)
        raise DuplicateTokenError,
              "duplicate design token #{key.inspect}: defined at both " \
              "#{origins.fetch(key).inspect} and #{path.inspect}"
      end

      origins[key] = path
      key
    end
    private_class_method :register
  end
end
