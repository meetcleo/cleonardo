require_relative "errors"

module CleoDesignTokens
  # Wraps one frozen lookup with a `fetch`. Exposed so tests can build one
  # over a fixture lookup, exactly like the module's own `colors.primitives`.
  class Bucket
    def initialize(lookup, palettes = PALETTES)
      @lookup = lookup
      @palettes = palettes
    end

    def fetch(key, palette: "current")
      patch = PaletteLookup.patch(@palettes, palette)
      value = @lookup.fetch(key) { raise UnknownTokenError, "unknown design token: #{key.inspect}" }
      # `Hash#fetch` only guards a missing *key* — a key present with a nil
      # value (malformed data: a primitive leaf with no `$value`) would
      # otherwise return nil instead of raising.
      raise UnknownTokenError, "design token #{key.inspect} has no value" if value.nil?

      patch.fetch(key, value)
    end
  end

  # `current` is the palette as generated from Figma; any other palette is a
  # hand-authored patch over it (tokens/patches/*.json) — only the primitives
  # whose value changes. Semantic roles follow their `$ref` into the patch.
  module PaletteLookup
    def self.patch(palettes, palette)
      palettes.fetch(palette.to_s) { raise UnknownPaletteError, "unknown palette: #{palette.inspect}" }
    end
  end
end
