require_relative "errors"

module CleoDesignTokens
  # Wraps one frozen lookup with a single-argument `fetch`. Exposed so tests
  # can build one over a fixture lookup, exactly like the module's own
  # `colors.primitives` below.
  class Bucket
    def initialize(lookup)
      @lookup = lookup
    end

    def fetch(key)
      @lookup.fetch(key) { raise UnknownTokenError, "unknown design token: #{key.inspect}" }
    end
  end
end
