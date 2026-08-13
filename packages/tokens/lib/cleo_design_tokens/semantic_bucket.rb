require_relative "errors"

module CleoDesignTokens
  # `theme:` defaults to `"base"` — `$themes` never carries a `"base"` key
  # (Base isn't an override of itself), so the default and an explicit
  # `theme: :base` resolve identically with no special-casing.
  class SemanticBucket
    THEMES = %w[base chat roast hype].freeze
    private_constant :THEMES

    def initialize(lookup)
      @lookup = lookup
    end

    def fetch(key, theme: "base")
      theme = theme.to_s
      raise UnknownThemeError, "unknown theme: #{theme.inspect}" unless THEMES.include?(theme)

      entry = @lookup.fetch(key) { raise UnknownTokenError, "unknown design token: #{key.inspect}" }
      value = resolve(entry, theme)
      if value.nil?
        raise UnknownTokenError,
              "design token #{key.inspect} has no Base value and no override for theme #{theme.inspect}"
      end

      value
    end

    private

    # What a caller gets for (role, theme): the theme's override when it has
    # one, otherwise the Base value — mirrors transform-core.mjs's
    # `resolveTheme` exactly. Returns nil when neither exists, which is what
    # makes `fetch` raise for the Base-less roles.
    def resolve(entry, theme)
      entry.themes[theme] || entry.value
    end
  end
end
