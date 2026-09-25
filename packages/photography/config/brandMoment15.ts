import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 3194,
        height: 2393,
      },
      focalPoint: {
        x: 1597,
        y: 1196.5,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 1043,
          width: 1104,
          height: 2393,
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
