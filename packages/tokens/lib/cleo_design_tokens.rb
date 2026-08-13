require "json"

# Only what this file references directly. `lookup_builder` pulls in
# `tree_walker`/`semantic_entry`/`errors` itself, and `bucket`/
# `semantic_bucket` each pull in `errors` themselves — Ruby's `require` is
# idempotent, so re-requiring them here would just be noise.
require_relative "cleo_design_tokens/version"
require_relative "cleo_design_tokens/lookup_builder"
require_relative "cleo_design_tokens/bucket"
require_relative "cleo_design_tokens/semantic_bucket"

# Reads Cleo's canonical colour design tokens (packages/tokens/tokens/color)
# into two frozen lookups, namespaced by token type then layer, with the
# theme passed alongside the key rather than baked into it.
#
#   CleoDesignTokens.colors.semantic.fetch("core.content.primary")                # => "#47201C"
#   CleoDesignTokens.colors.semantic.fetch("core.content.primary", theme: :roast) # => "#F8F6F2"
#   CleoDesignTokens.colors.primitives.fetch("brown.800")                        # => "#47201C"
module CleoDesignTokens
  TOKENS_DIR = File.expand_path("../tokens/color", __dir__)
  PRIMITIVES_PATH = File.join(TOKENS_DIR, "primitives.json")
  SEMANTIC_PATH = File.join(TOKENS_DIR, "semantic.json")

  # Built at load, into constants — not `@lookup ||=`, which would race under
  # concurrent access. Frozen from the moment the gem loads, so every reader
  # in every thread sees the same immutable lookup.
  PRIMITIVES_LOOKUP = LookupBuilder.build_lookup(JSON.parse(File.read(PRIMITIVES_PATH))).freeze
  SEMANTIC_LOOKUP = LookupBuilder.build_semantic_lookup(JSON.parse(File.read(SEMANTIC_PATH))).freeze

  # Namespaced by token type (`colors`), then by layer (`primitives`,
  # `semantic`) — lowercase accessors, not `CleoDesignTokens::Colors::
  # Semantic.fetch(...)` module nesting, so the call text stays identical to
  # the TypeScript reader (a colour greps across both repos).
  #
  # `Data`, not a plain Hash: `colors.primitives` needs to be an attribute
  # read (matching the reader's own dot-accessor contract), and a Hash has
  # no `.primitives` method. Plural `Colors`, not `Color` — an instance
  # holds both buckets for the `colors` token type, not a single colour.
  Colors = Data.define(:primitives, :semantic)
  COLORS = Colors.new(primitives: Bucket.new(PRIMITIVES_LOOKUP), semantic: SemanticBucket.new(SEMANTIC_LOOKUP))

  def self.colors
    COLORS
  end
end
