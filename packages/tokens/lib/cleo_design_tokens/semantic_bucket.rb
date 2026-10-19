require_relative "errors"

module CleoDesignTokens
  # `theme:` defaults to `"base"` — `$themes` never carries a `"base"` key
  # (Base isn't an override of itself), so the default and an explicit
  # `theme: :base` resolve identically with no special-casing.
  class SemanticBucket
    THEMES = %w[base chat roast hype].freeze
    private_constant :THEMES

    def initialize(lookup, palettes = PALETTES)
      @lookup = lookup
      @palettes = palettes
    end

    def fetch(key, theme: "base", palette: "current")
      theme = theme.to_s
      raise UnknownThemeError, "unknown theme: #{theme.inspect}" unless THEMES.include?(theme)

      patch = PaletteLookup.patch(@palettes, palette)

      entry = @lookup.fetch(key) { raise UnknownTokenError, "unknown design token: #{key.inspect}" }
      value, ref = resolve(entry, theme)
      if value.nil?
        raise UnknownTokenError,
              "design token #{key.inspect} has no Base value and no override for theme #{theme.inspect}"
      end

      (patch[ref] unless ref.nil?) || value
    end

    private

    # What a caller gets for (role, theme): the theme's override when it has
    # one, otherwise the Base value — mirrors transform-core.mjs's
    # `resolveTheme` exactly — paired with the primitive it came from. The
    # value is nil when neither exists, which is what makes `fetch` raise for
    # the Base-less roles.
    def resolve(entry, theme)
      return [entry.themes[theme], entry.theme_refs[theme]] if entry.themes.key?(theme)

      [entry.value, entry.ref]
    end
  end
end
