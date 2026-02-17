import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 3028,
        height: 3001,
      },
      focalPoint: {
        x: 2060,
        y: 1260,
        normalizedX: 0.68,
        normalizedY: 0.42,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 1150,
          left: 330,
          width: 1918,
          height: 1900,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
      },
    },
  },
};

export default config;
