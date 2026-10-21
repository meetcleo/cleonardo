require "json"

RSpec.describe "reference-based semantic colours" do
  let(:primitives) { JSON.parse(File.read(File.join(__dir__, "fixtures/reader/primitives-experiences.json"))) }
  let(:semantic) { JSON.parse(File.read(File.join(__dir__, "fixtures/reader/reference-semantics.json"))) }
  let(:configuration) { CleoDesignTokens::Configuration.new(primitives: primitives, semantic: semantic) }

  before { stub_const("CleoDesignTokens::CONFIGURATION", configuration) }
  after { CleoDesignTokens.configure(experience: :current) }

  it "rebinds shared references, keeps literals and replaces explicit experience themes" do
    fetch = CleoDesignTokens.colors.semantic.method(:fetch)
    expect(fetch.call("core.content.primary")).to eq("#47201C")
    CleoDesignTokens.configure(experience: :refresh) do
      expect(fetch.call("core.content.primary")).to eq("#192012")
      expect(fetch.call("core.content.primary", theme: :roast)).to eq("#F9F9F8")
      expect(fetch.call("core.content.secondary", theme: :roast)).to eq("#192012")
      expect(fetch.call("effects.background.glassMorphism")).to eq("#00000033")
      expect(fetch.call("core.border.level0", theme: :chat)).to eq("#F9F9F8")
      expect { fetch.call("core.border.level0") }.to raise_error(CleoDesignTokens::UnknownTokenError)
    end
    expect(fetch.call("core.content.primary")).to eq("#47201C")
  end

  it "rejects a dangling Refresh reference without changing the active palette" do
    semantic.fetch("core").fetch("content").fetch("secondary").fetch("$experiences").fetch("cleoRefresh")["$ref"] = "missing"
    expect { CleoDesignTokens.configure(experience: :refresh) }.to raise_error(CleoDesignTokens::UnknownExperienceError)
    expect(CleoDesignTokens.colors.primitives.fetch("brown.800")).to eq("#47201C")
  end
end
