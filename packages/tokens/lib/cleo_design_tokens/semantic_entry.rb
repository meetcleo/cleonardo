module CleoDesignTokens
  # One semantic role: its Base value (nil when the role only exists under a
  # theme) plus whatever theme overrides genuinely differ from Base.
  SemanticEntry = Struct.new(:value, :themes)
end
