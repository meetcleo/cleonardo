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
    def self.build_lookup(tree, experience: :current)
      flatten_tree(tree) do |leaf, key|
        value = experience_leaf(leaf, experience, key)["$value"]
        unless value.is_a?(String)
          raise UnknownExperienceError, "design token #{key.inspect} has no primitive value for experience #{experience.inspect}"
        end
        value.freeze
      end
    end

    # Flattens `semantic.json` into a key -> SemanticEntry lookup, one entry
    # per role — the theme axis lives inside the entry, not in the key.
    def self.build_semantic_lookup(tree, experience: :current, primitives: nil)
      schema = tree["$schema"]
      if tree.key?("$schema") && schema != "cleo-semantic-references/1"
        raise UnknownExperienceError, "unsupported semantic schema: #{schema.inspect}"
      end
      references = schema == "cleo-semantic-references/1"
      flatten_tree(tree) do |leaf, key|
        snapshots = leaf["$experiences"]
        if references && leaf.key?("$experiences") && !snapshots.is_a?(Hash)
          raise UnknownExperienceError, "invalid semantic experiences for #{key.inspect}"
        end
        shared = references && (experience.to_s == "current" || !snapshots.is_a?(Hash) || !snapshots.key?("cleoRefresh"))
        snapshot = shared ? leaf : experience_leaf(leaf, experience, key)
        semantic_entry(snapshot, experience, key, primitives: primitives, references: references)
      end
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
        lookup[key] = yield(leaf, key)
      end
      lookup
    end
    private_class_method :flatten_tree

    def self.experience_leaf(leaf, experience, key)
      return leaf if experience.to_s == "current"
      unless experience.to_s == "refresh"
        raise UnknownExperienceError, "unknown experience: #{experience.inspect}; expected :current or :refresh"
      end

      snapshots = leaf["$experiences"]
      snapshot = snapshots["cleoRefresh"] if snapshots.is_a?(Hash)
      unless snapshot.is_a?(Hash)
        raise UnknownExperienceError, "experience :refresh is unavailable for design token #{key.inspect}; sync the Refresh colour data first"
      end
      snapshot
    end
    private_class_method :experience_leaf

    def self.semantic_entry(leaf, experience, key, primitives:, references:)
      themes = {}
      raw_themes = leaf["$themes"] || {}
      unless raw_themes.is_a?(Hash)
        raise UnknownExperienceError, "design token #{key.inspect} has invalid themes for experience #{experience.inspect}"
      end
      raw_themes.each do |theme, override|
        value = override.is_a?(Hash) ? semantic_value(override, key, primitives: primitives, references: references) : nil
        unless value.is_a?(String)
          raise UnknownExperienceError, "design token #{key.inspect} has no value for theme #{theme.inspect} in experience #{experience.inspect}"
        end
        themes[theme] = value.freeze
      end
      value = semantic_value(leaf, key, primitives: primitives, references: references)
      if (leaf.key?("$value") && !value.is_a?(String)) || (value.nil? && themes.empty?)
        raise UnknownExperienceError, "design token #{key.inspect} has no semantic values for experience #{experience.inspect}"
      end

      # `Data#new` freezes the instance itself; the Hash inside it still
      # needs its own `.freeze` — freezing is shallow.
      SemanticEntry.new(value&.freeze, themes.freeze)
    end
    private_class_method :semantic_entry

    def self.semantic_value(binding, key, primitives:, references:)
      return binding["$value"] unless references && binding.key?("$ref")
      ref = binding["$ref"]
      if !ref.is_a?(String) || !primitives&.key?(ref) || binding.key?("$value")
        raise UnknownExperienceError, "invalid primitive reference #{ref.inspect} for #{key.inspect}"
      end
      primitives.fetch(ref)
    end
    private_class_method :semantic_value
  end
end
