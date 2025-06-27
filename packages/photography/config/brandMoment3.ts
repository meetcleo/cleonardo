import { CropType, PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.LANDSCAPE_LARGE, CropType.PORTRAIT_MEDIUM],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 2649,
        height: 3189,
      },
      focalPoint: {
        x: 1324.5,
        y: 1594.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 588,
          width: 1473,
          height: 3189,
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
          left: 149,
          width: 2351,
          height: 3189,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 610,
          left: 0,
          width: 2649,
          height: 1490,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1,
      },
    },
  },
};

export default config;
