require_relative "lib/cleo_design_tokens/version"

Gem::Specification.new do |spec|
  spec.name = "cleo_design_tokens"
  spec.version = CleoDesignTokens::VERSION
  spec.authors = ["Cleo"]
  spec.summary = "Ruby reader for Cleo's canonical colour design tokens"
  spec.description = "Flattens Cleo's colour design tokens (packages/tokens/tokens/color) " \
                      "into frozen colors.primitives / colors.semantic lookups, with the theme " \
                      "passed alongside the key."
  spec.required_ruby_version = ">= 3.2" # Data.define

  # The data ships with the gem, or the gem is useless.
  spec.files = Dir["lib/**/*.rb"] + Dir["tokens/color/*.json"]
  spec.require_paths = ["lib"]

  # Not publishable from here — publishing is COREEXP-334.
  spec.metadata["allowed_push_host"] = "https://gemfury.invalid/not-a-real-host"
end
