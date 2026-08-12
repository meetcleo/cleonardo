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
      flatten_tree(tree) { |leaf| leaf["$value"].freeze }
    end

    # Flattens `semantic.json` into a key -> SemanticEntry lookup, one entry
    # per role — the theme axis lives inside the entry, not in the key.
    def self.build_semantic_lookup(tree)
      flatten_tree(tree) { |leaf| semantic_entry(leaf) }
    end

    # Walks `tree`, turning each leaf into a lookup entry via the block —
    # the only thing that differs between the two builders above is how a
    # leaf becomes a value, so that's the only thing left as a parameter.
    #
    # Fails loudly on a collision (two paths normalising to the same key)
    # rather than letting one silently win, shared here so neither builder
    # can drift on that guarantee. `origins` maps key -> the *path array*
    # that produced it, not the key itself — two different paths can
    # normalise to the same key (e.g. a segment that itself contains a
    # literal `.`), and storing the path (rather than re-deriving the
    # identical string) is what lets the error below name both distinctly
    # instead of printing the same string twice.
    def self.flatten_tree(tree)
      lookup = {}
      origins = {}
      TreeWalker.walk(tree) do |path, leaf|
        key = path.join(".")
        if origins.key?(key)
          raise DuplicateTokenError,
                "duplicate design token #{key.inspect}: defined at both " \
                "#{origins.fetch(key).inspect} and #{path.inspect}"
        end

        origins[key] = path
        lookup[key] = yield(leaf)
      end
      lookup
    end
    private_class_method :flatten_tree

    def self.semantic_entry(leaf)
      themes = {}
      (leaf["$themes"] || {}).each { |theme, override| themes[theme] = override["$value"].freeze }

      # `Data#new` freezes the instance itself; the Hash inside it still
      # needs its own `.freeze` — freezing is shallow.
      SemanticEntry.new(leaf["$value"]&.freeze, themes.freeze)
    end
    private_class_method :semantic_entry
  end
end
