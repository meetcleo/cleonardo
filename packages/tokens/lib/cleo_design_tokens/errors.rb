module CleoDesignTokens
  class UnknownTokenError < KeyError; end
  class UnknownThemeError < ArgumentError; end
  class UnknownExperienceError < ArgumentError; end
  class DuplicateTokenError < KeyError; end
end
