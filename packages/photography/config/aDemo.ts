import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 1024,
        height: 1024,
      },
      focalPoint: {
        x: 512,
        y: 512,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 276,
          width: 473,
          height: 1024,
        },
        targetDimensions: {
          width: 375,
          height: 812,
        },
        zoom: 1,
      },
      PORTRAIT_SMALL: {
        extractParams: {
          top: 85,
          left: 197,
          width: 629,
          height: 853,
        },
        targetDimensions: {
          width: 143,
          height: 194,
        },
        zoom: 1.2,
      },
      PORTRAIT_MEDIUM: {
        extractParams: {
          top: 0,
          left: 143,
          width: 737,
          height: 1024,
        },
        targetDimensions: {
          width: 360,
          height: 500,
        },
        zoom: 1,
      },
      LANDSCAPE_LARGE: {
        extractParams: {
          top: 71,
          left: 0,
          width: 1024,
          height: 576,
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
