import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 2436,
        height: 2436,
      },
      focalPoint: {
        x: 1340,
        y: 590,
        normalizedX: 0.55,
        normalizedY: 0.242,
      },
    },
    crops: {
      // extractParams are horizontally centred on the logo pill (x≈1340); vertical framing is unchanged
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 762,
          width: 1157,
          height: 2436,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 0,
          left: 417,
          width: 1847,
          height: 2436,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 384,
          left: 246,
          width: 2190,
          height: 1232,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 0,
          left: 438,
          width: 1804,
          height: 2436,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1,
      },
      LANDSCAPE_RATIO_4_3: {
        extractParams: {
          top: 397,
          left: 246,
          width: 2190,
          height: 1643,
        },
        targetDimensions: {
          width: 400,
          height: 300,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
