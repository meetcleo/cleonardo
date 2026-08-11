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
        lookup[key] = leaf["$value"].dup.freeze
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
          themes[theme] = override["$value"].dup.freeze
        end

        value = leaf["$value"]
        lookup[key] = SemanticEntry.new(value && value.dup.freeze, themes.freeze).freeze
      end
      lookup
    end

    # Raises if `path`'s key already exists in `lookup`, else records the
    # origin and returns the key. Shared by both builders so the duplicate-
    # detection message can't drift between them.
    def self.register(lookup, origins, path)
      key = path.join(".")
      if lookup.key?(key)
        raise DuplicateTokenError,
              "duplicate design token #{key.inspect}: defined at both " \
              "#{origins.fetch(key)} and #{path.join('.')}"
      end

      origins[key] = path.join(".")
      key
    end
    private_class_method :register
  end
end
