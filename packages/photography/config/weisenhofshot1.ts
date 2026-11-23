import { PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  cropTypes: ['PORTRAIT_LARGE'],
  focalPoint: {
    originalImage: {
      dimensions: {
        width: 1796,
        height: 1346,
      },
      focalPoint: {
        x: 1092.9,
        y: 200,
        normalizedX: 0.6085,
        normalizedY: 0.1486,
      },
    },
    crops: {
      PORTRAIT_LARGE: {
        extractParams: {
          top: 0,
          left: 782,
          width: 622,
          height: 1346,
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
