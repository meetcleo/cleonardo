require "json"

RSpec.describe CleoDesignTokens do
  def load_fixture(name)
    JSON.parse(File.read(File.join(__dir__, "fixtures", "reader", "#{name}.json")))
  end

  let(:primitives_bucket) { described_class::Bucket.new(described_class.build_lookup(load_fixture("primitives"))) }
  let(:semantic_bucket) { described_class::SemanticBucket.new(described_class.build_semantic_lookup(load_fixture("semantic"))) }

  describe "colors.primitives.fetch" do
    it "resolves a known primitive key" do
      expect(primitives_bucket.fetch("brown.800")).to eq("#47201C")
    end

    it "raises on an unknown key rather than returning nil" do
      expect { primitives_bucket.fetch("no.such.token") }.to raise_error(CleoDesignTokens::UnknownTokenError)
    end

    it "raises on a key that exists only in the semantic bucket" do
      expect { primitives_bucket.fetch("core.content.primary") }.to raise_error(CleoDesignTokens::UnknownTokenError)
    end
  end

  describe "colors.semantic.fetch" do
    it "resolves Base by default" do
      expect(semantic_bucket.fetch("core.content.primary")).to eq("#47201C")
    end

    it "resolves a theme override" do
      expect(semantic_bucket.fetch("core.content.primary", theme: :roast)).to eq("#F8F6F2")
    end

    it "falls back to Base when the theme has no override for that role" do
      expect(semantic_bucket.fetch("core.content.primary", theme: :hype)).to eq("#47201C")
    end

    it "raises on a themeless read of a role with no Base value" do
      expect { semantic_bucket.fetch("core.border.level0") }.to raise_error(CleoDesignTokens::UnknownTokenError)
    end

    it "resolves that same role once its theme is given" do
      expect(semantic_bucket.fetch("core.border.level0", theme: :chat)).to eq("#F8F6F2")
    end

    it "raises on a role with no Base value and no override for the given theme either" do
      expect { semantic_bucket.fetch("core.border.level0", theme: :roast) }.to raise_error(CleoDesignTokens::UnknownTokenError)
    end

    it "raises on an unknown key rather than returning nil" do
      expect { semantic_bucket.fetch("no.such.token") }.to raise_error(CleoDesignTokens::UnknownTokenError)
    end

    it "raises on a key that exists only in the primitives bucket" do
      expect { semantic_bucket.fetch("brown.800") }.to raise_error(CleoDesignTokens::UnknownTokenError)
    end

    it "raises on an unknown theme" do
      expect { semantic_bucket.fetch("core.content.primary", theme: :nope) }.to raise_error(CleoDesignTokens::UnknownThemeError)
    end

    # The theme axis is gone from the key: real files now carry resolved
    # values keyed one entry per role, so these assert directly against them.
    it "resolves against the real committed files" do
      expect(described_class.colors.semantic.fetch("core.content.primary")).to eq("#47201C")
      expect(described_class.colors.semantic.fetch("core.content.primary", theme: :roast)).to eq("#F8F6F2")
      expect(described_class.colors.primitives.fetch("brown.800")).to eq("#47201C")
    end
  end

  describe ".build_lookup" do
    it "fails loudly on a collision, within one tree" do
      expect { described_class.build_lookup(load_fixture("collision")) }
        .to raise_error(CleoDesignTokens::DuplicateTokenError, /brown\.800/)
    end
  end

  describe "PRIMITIVES_LOOKUP / SEMANTIC_LOOKUP" do
    it "are frozen" do
      expect(described_class::PRIMITIVES_LOOKUP).to be_frozen
      expect(described_class::SEMANTIC_LOOKUP).to be_frozen
      expect { described_class::PRIMITIVES_LOOKUP["new.key"] = "#000000" }.to raise_error(FrozenError)
    end

    it "are non-empty, sized to the real files" do
      expect(described_class::PRIMITIVES_LOOKUP.size).to eq(106)
      expect(described_class::SEMANTIC_LOOKUP.size).to eq(473)
    end

    it "freezes every value it holds" do
      described_class::PRIMITIVES_LOOKUP.each_value { |value| expect(value).to be_frozen }
      described_class::SEMANTIC_LOOKUP.each_value do |entry|
        expect(entry).to be_frozen
        expect(entry.value).to be_frozen unless entry.value.nil?
        entry.themes.each_value { |value| expect(value).to be_frozen }
      end
    end
  end

  describe ".colors" do
    it "is frozen and returns the same instance" do
      expect(described_class.colors).to be_frozen
      expect(described_class.colors).to equal(described_class.colors)
    end
  end
end
