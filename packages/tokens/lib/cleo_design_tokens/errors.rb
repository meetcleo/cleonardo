module CleoDesignTokens
  class UnknownTokenError < KeyError; end
  class UnknownThemeError < StandardError; end
  class DuplicateTokenError < StandardError; end
end
