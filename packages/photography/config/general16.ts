import { CropType, PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.PORTRAIT_MEDIUM],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 4039,
        height: 4154,
      },
      focalPoint: {
        x: 2019.5,
        y: 2077,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 1060,
          width: 1918,
          height: 4154,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 1140,
          left: 1688,
          width: 1021,
          height: 1385,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 3,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 1311,
          left: 1224,
          width: 2020,
          height: 1136,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 2,
      },
    },
  },
};

export default config;
