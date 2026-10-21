require "json"

RSpec.describe "CleoDesignTokens.configure" do
  let(:data) { JSON.parse(File.read(File.join(__dir__, "fixtures", "reader", "ruby-experiences.json"))) }
  let(:configuration) { CleoDesignTokens::Configuration.new(primitives: data.fetch("primitives"), semantic: data.fetch("semantic")) }

  before do
    stub_const("CleoDesignTokens::CONFIGURATION", configuration)
  end

  after do
    CleoDesignTokens.configure(experience: :current)
  end

  it "defaults to Current" do
    expect(CleoDesignTokens.colors.primitives.fetch("brown.800")).to eq("#47201C")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
  end

  it "switches both buckets including captured readers and methods" do
    primitives = CleoDesignTokens.colors.primitives
    semantic = CleoDesignTokens.colors.semantic.method(:fetch)
    resolved = semantic.call("core.content.primary")
    CleoDesignTokens.configure(experience: :refresh)
    expect(primitives.fetch("brown.800")).to eq("#192012")
    expect(semantic.call("core.content.primary")).to eq("#192012")
    expect(semantic.call("core.content.primary", theme: :roast)).to eq("#F9F9F8")
    expect(resolved).to eq("#47201C")
  end

  it "accepts string experiences and resets to Current" do
    CleoDesignTokens.configure(experience: "refresh")
    CleoDesignTokens.configure(experience: "refresh")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#192012")
    CleoDesignTokens.configure(experience: "current")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
    expect(CleoDesignTokens.spacing(2)).to eq(8)
  end

  it "falls back to Refresh Base without inheriting Current theme overrides" do
    CleoDesignTokens.configure(experience: :refresh)
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.secondary", theme: :roast)).to eq("#F9F9F8")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary", theme: :hype)).to eq("#192012")
  end

  it "preserves theme-only roles without a Base value" do
    CleoDesignTokens.configure(experience: :refresh)
    expect(CleoDesignTokens.colors.semantic.fetch("core.border.level0", theme: :chat)).to eq("#F9F9F8")
    expect { CleoDesignTokens.colors.semantic.fetch("core.border.level0") }.to raise_error(CleoDesignTokens::UnknownTokenError)
  end

  it "restores the previous selection after nested blocks and returns the block result" do
    result = CleoDesignTokens.configure(experience: :refresh) do
      CleoDesignTokens.configure(experience: :current) do
        expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
      end
      CleoDesignTokens.colors.semantic.fetch("core.content.primary")
    end
    expect(result).to eq("#192012")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
  end

  it "restores the previous selection when a block raises" do
    expect do
      CleoDesignTokens.configure(experience: :refresh) { raise "request failed" }
    end.to raise_error("request failed")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
  end

  [nil, :unknown, :cleoRefresh, 123].each do |experience|
    it "rejects #{experience.inspect} without changing an active Refresh selection" do
      CleoDesignTokens.configure(experience: :refresh)
      expect { CleoDesignTokens.configure(experience: experience) }.to raise_error(CleoDesignTokens::UnknownExperienceError)
      expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#192012")
    end
  end

  it "keeps the active palette when a nested configuration fails before entering its block" do
    CleoDesignTokens.configure(experience: :refresh)
    expect { CleoDesignTokens.configure(experience: :unknown) { nil } }.to raise_error(CleoDesignTokens::UnknownExperienceError)
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#192012")
  end

  it "rejects missing primitive snapshots before changing either bucket" do
    data.fetch("primitives").fetch("brown").fetch("800").delete("$experiences")
    expect { CleoDesignTokens.configure(experience: :refresh) }.to raise_error(CleoDesignTokens::UnknownExperienceError)
    expect(CleoDesignTokens.colors.primitives.fetch("brown.800")).to eq("#47201C")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
  end

  it "rejects an incomplete semantic palette atomically" do
    data.fetch("semantic").fetch("core").fetch("content").fetch("secondary").delete("$experiences")
    expect { CleoDesignTokens.configure(experience: :refresh) }.to raise_error(CleoDesignTokens::UnknownExperienceError)
    expect(CleoDesignTokens.colors.primitives.fetch("brown.800")).to eq("#47201C")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
  end

  %w[primitive base theme empty null_theme invalid_themes null_snapshot].each do |kind|
    it "rejects an incomplete #{kind} value before switching" do
      primitive = data.fetch("primitives").fetch("brown").fetch("800").fetch("$experiences").fetch("cleoRefresh")
      semantic = data.fetch("semantic").fetch("core").fetch("content").fetch("primary").fetch("$experiences")
      case kind
      when "primitive" then primitive.delete("$value")
      when "base" then semantic.fetch("cleoRefresh")["$value"] = 123
      when "theme" then semantic.fetch("cleoRefresh").fetch("$themes")["roast"] = {}
      when "empty" then semantic["cleoRefresh"] = {}
      when "null_theme" then semantic.fetch("cleoRefresh").fetch("$themes")["hype"] = nil
      when "invalid_themes" then semantic.fetch("cleoRefresh")["$themes"] = []
      when "null_snapshot" then semantic["cleoRefresh"] = nil
      end
      expect { CleoDesignTokens.configure(experience: :refresh) }.to raise_error(CleoDesignTokens::UnknownExperienceError)
      expect(CleoDesignTokens.colors.primitives.fetch("brown.800")).to eq("#47201C")
    end
  end

  it "isolates simultaneous threads and restores a reused worker context" do
    ready = Queue.new
    release = Queue.new
    worker = Thread.new do
      CleoDesignTokens.configure(experience: :refresh) do
        ready << true
        release.pop
        expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#192012")
      end
      CleoDesignTokens.colors.semantic.fetch("core.content.primary")
    end
    begin
      ready.pop
      expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
    ensure
      release << true
    end
    expect(worker.value).to eq("#47201C")
  end

  it "isolates interleaved fibers on the same thread" do
    worker = Fiber.new do
      CleoDesignTokens.configure(experience: :refresh) do
        Fiber.yield CleoDesignTokens.colors.semantic.fetch("core.content.primary")
        CleoDesignTokens.colors.semantic.fetch("core.content.primary")
      end
    end
    expect(worker.resume).to eq("#192012")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
    expect(worker.resume).to eq("#192012")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
  end

  it "starts a new thread on Current even when its parent selected Refresh" do
    CleoDesignTokens.configure(experience: :refresh)
    value = Thread.new { CleoDesignTokens.colors.semantic.fetch("core.content.primary") }.value
    expect(value).to eq("#47201C")
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#192012")
  end

  it "shares one immutable cached Refresh palette between concurrent callers" do
    ready = Queue.new
    start = Queue.new
    workers = 2.times.map do
      Thread.new do
        ready << true
        start.pop
        CleoDesignTokens.configure(experience: :refresh) { configuration.palette }
      end
    end
    2.times { ready.pop }
    2.times { start << true }
    palettes = workers.map(&:value)
    expect(palettes.first).to equal(palettes.last)
    expect(palettes.first).to be_frozen
    expect(palettes.first.primitives).to be_frozen
    expect(palettes.first.semantic).to be_frozen
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
  end

  it "keeps the shared lookups immutable and the public colors object stable" do
    colors = CleoDesignTokens.colors
    CleoDesignTokens.configure(experience: :refresh)
    expect(CleoDesignTokens.colors).to equal(colors)
    expect(configuration.default_palette.primitives).to be_frozen
    expect(configuration.default_palette.semantic).to be_frozen
    expect(CleoDesignTokens.colors.semantic.fetch("core.content.primary")).to be_frozen
    expect(CleoDesignTokens::PRIMITIVES_LOOKUP.fetch("brown.800")).to eq("#47201C")
  end
end
