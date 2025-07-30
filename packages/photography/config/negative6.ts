import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 3366,
        height: 3189,
      },
      focalPoint: {
        x: 1683,
        y: 1594.5,
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
          top: 231,
          left: 1571,
          width: 2041,
          height: 2769,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.5,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 1043,
          left: 1484,
          width: 2126,
          height: 1196,
        },
        targetDimensions: {
          width: 400,
          height: 225,
        },
        zoom: 1.9,
      },
    },
  },
};

export default config;
