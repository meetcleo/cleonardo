import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 995,
        height: 745,
      },
      focalPoint: {
        x: 497.5,
        y: 372.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 325,
          width: 344,
          height: 745,
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
