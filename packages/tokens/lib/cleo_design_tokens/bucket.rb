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
      value = @lookup.fetch(key) { raise UnknownTokenError, "unknown design token: #{key.inspect}" }
      # `Hash#fetch` only guards a missing *key* — a key present with a nil
      # value (malformed data: a primitive leaf with no `$value`) would
      # otherwise return nil instead of raising.
      raise UnknownTokenError, "design token #{key.inspect} has no value" if value.nil?

      value
    end
  end
end
