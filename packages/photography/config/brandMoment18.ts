import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 1136,
        height: 851,
      },
      focalPoint: {
        x: 303.8,
        y: 311.2,
        normalizedX: 0.2674,
        normalizedY: 0.3656,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 107,
          width: 393,
          height: 851,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
