require "thread"
require_relative "lookup_builder"

module CleoDesignTokens
  class Configuration
    Palette = Data.define(:primitives, :semantic)
    CONTEXT_KEY = :cleo_design_tokens_palette
    private_constant :Palette, :CONTEXT_KEY

    attr_reader :default_palette

    def initialize(primitives:, semantic:)
      @primitives = primitives
      @semantic = semantic
      @default_palette = build_palette(:current)
      @refresh_palette = nil
      @mutex = Mutex.new
    end

    def palette
      # Thread#[] is fiber-local, unlike Thread#thread_variable_get.
      Thread.current[CONTEXT_KEY] || default_palette
    end

    def configure(experience:)
      selected = case experience
      when :current, "current" then nil
      when :refresh, "refresh"
        @mutex.synchronize { @refresh_palette ||= build_palette(:refresh) }
      else
        raise UnknownExperienceError, "unknown experience: #{experience.inspect}; expected :current or :refresh"
      end

      unless block_given?
        Thread.current[CONTEXT_KEY] = selected
        return nil
      end

      previous = Thread.current[CONTEXT_KEY]
      begin
        Thread.current[CONTEXT_KEY] = selected
        yield
      ensure
        Thread.current[CONTEXT_KEY] = previous
      end
    end

    private

    def build_palette(experience)
      primitives = LookupBuilder.build_lookup(@primitives, experience: experience).freeze
      Palette.new(
        primitives: primitives,
        semantic: LookupBuilder.build_semantic_lookup(@semantic, experience: experience, primitives: primitives).freeze,
      )
    end
  end
end
