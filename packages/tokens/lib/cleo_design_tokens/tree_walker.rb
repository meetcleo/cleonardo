module CleoDesignTokens
  # Walks a token tree, skipping `$`-prefixed keys, yielding each leaf's path
  # and node to the block. Keys are the JSON path, dot-joined — the files
  # carry no `color.primitives`/`color.semantic` wrapper to strip, and
  # segments are already normalised on disk, so there's nothing left for a
  # caller to do to a path.
  module TreeWalker
    # A leaf is `{ "$type" => "color", ... }` — matches transform-core.mjs's
    # `isLeaf` exactly. A role can carry `$themes` and no `$value` at all
    # (defined only under a theme, missing from Base in Figma), so `$value`
    # presence is never part of this check.
    def self.leaf?(node)
      node.is_a?(Hash) && node["$type"] == "color"
    end
    private_class_method :leaf?

    def self.walk(node, path = [], &on_leaf)
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
  end
end
