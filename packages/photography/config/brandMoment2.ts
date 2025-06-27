import { CropType, PhotographyConfig } from '../helpers/types';

const config: PhotographyConfig = {
  crops: [CropType.PORTRAIT_LARGE, CropType.PORTRAIT_MEDIUM],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 4389,
        height: 3183,
      },
      focalPoint: {
        x: 2194.5,
        y: 1591.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 1460,
          width: 1470,
          height: 3183,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 412,
          left: 1172,
          width: 1955,
          height: 2653,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.2,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 499,
          left: 941,
          width: 2438,
          height: 1372,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1.8,
      },
    },
  },
};

export default config;
