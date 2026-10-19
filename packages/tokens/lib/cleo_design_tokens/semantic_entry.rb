module CleoDesignTokens
  # One semantic role: its Base value (nil when the role only exists under a
  # theme) plus whatever theme overrides genuinely differ from Base, each with
  # the primitive it came from — what a palette patch is applied through. `Data`,
  # not a `Struct` — this is a fixed value, never mutated after it's built,
  # and `Data` instances are frozen on construction with no extra `.freeze`.
  SemanticEntry = Data.define(:value, :ref, :themes, :theme_refs)
end
