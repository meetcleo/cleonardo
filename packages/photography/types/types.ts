export enum CropType {
  PORTRAIT_LARGE = 'PORTRAIT_LARGE',
  PORTRAIT_MEDIUM = 'PORTRAIT_MEDIUM',
  PORTRAIT_SMALL = 'PORTRAIT_SMALL',
  LANDSCAPE_LARGE = 'LANDSCAPE_LARGE',
}

export type CropConfig = {
  [key in CropType]: string;
};

export interface PhotographyConfig {
  crops: CropType[];
  focalPoint?: {
    originalImage: {
      dimensions: {
        width: number;
        height: number;
      };
      focalPoint: {
        x: number;
        y: number;
        normalizedX: number;
        normalizedY: number;
      };
    };
    crops: {
      [key in CropType]?: {
        extractParams: {
          top: number;
          left: number;
          width: number;
          height: number;
        };
        targetDimensions: {
          width: number;
          height: number;
        };
        zoom?: number;
      };
    };
  };
}

export const cropSpecs: Record<CropType, { width: number; height: number; crop: string }> = {
  [CropType.PORTRAIT_LARGE]: {
    width: 375,
    height: 812,
    crop: 'cover',
  },
  [CropType.PORTRAIT_MEDIUM]: {
    width: 360,
    height: 500,
    crop: 'cover',
  },
  [CropType.PORTRAIT_SMALL]: {
    width: 143,
    height: 194,
    crop: 'cover',
  },
  [CropType.LANDSCAPE_LARGE]: {
    width: 400,
    height: 225,
    crop: 'cover',
  },
};
