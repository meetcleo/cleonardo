#!/usr/bin/env ruby
# frozen_string_literal: true

# Asserts lib/cleo_design_tokens/version.rb and package.json agree on the
# gem/npm version. package.json is the source of truth (npm requires a
# literal); version.rb holds its own literal rather than parsing
# package.json at load, since an installed gem ships without package.json
# and would raise Errno::ENOENT on require.

require "json"

root = File.expand_path("..", __dir__)
require_relative "../lib/cleo_design_tokens/version"

package_json = JSON.parse(File.read(File.join(root, "package.json")))
npm_version = package_json.fetch("version")
gem_version = CleoDesignTokens::VERSION

if npm_version != gem_version
  warn "version mismatch: package.json is #{npm_version.inspect}, " \
       "lib/cleo_design_tokens/version.rb is #{gem_version.inspect}"
  exit 1
end

puts "versions match: #{npm_version}"
