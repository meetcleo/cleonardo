require "json"

module CleoDesignTokens
  # `package.json`'s `version` is the single source of truth — npm requires
  # it to be a literal, so it can't defer to us. The gemspec ships
  # `package.json` alongside `lib/` (see `spec.files`) specifically so this
  # read works from an installed gem too, not just this source checkout.
  VERSION = JSON.parse(File.read(File.expand_path("../../package.json", __dir__))).fetch("version")
end
