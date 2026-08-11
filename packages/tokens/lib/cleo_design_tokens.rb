require "json"

require_relative "cleo_design_tokens/version"
require_relative "cleo_design_tokens/errors"
require_relative "cleo_design_tokens/tree_walker"
require_relative "cleo_design_tokens/semantic_entry"
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

  # Built at load, into constants — not `@lookup ||=`. The AC ("frozen and
  # safe to read from multiple threads") rules out lazy init, which is the
  # race.
  PRIMITIVES_LOOKUP = LookupBuilder.build_lookup(JSON.parse(File.read(PRIMITIVES_PATH))).freeze
  SEMANTIC_LOOKUP = LookupBuilder.build_semantic_lookup(JSON.parse(File.read(SEMANTIC_PATH))).freeze

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
