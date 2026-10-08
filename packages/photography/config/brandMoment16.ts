import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 1342,
        height: 888,
      },
      focalPoint: {
        x: 751.6,
        y: 105.5,
        normalizedX: 0.5601,
        normalizedY: 0.1188,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 547,
          width: 410,
          height: 888,
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
