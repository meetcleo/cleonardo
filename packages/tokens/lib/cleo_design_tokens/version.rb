require "json"

module CleoDesignTokens
  # The release workflow writes the computed version into `package.json` before
  # building either artifact. The gemspec ships that file alongside `lib/`
  # (see `spec.files`) so this read works from an installed gem too.
  VERSION = JSON.parse(File.read(File.expand_path("../../package.json", __dir__))).fetch("version")
end
