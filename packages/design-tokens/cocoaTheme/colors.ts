type valueof<T> = T[keyof T];

export type CocoaColors =
  | typeof colors.black
  | typeof colors.white
  | typeof colors.offWhite
  | valueof<typeof colors.whiteAlpha>
  | valueof<typeof colors.blackAlpha>
  | valueof<typeof colors.red>
  | valueof<typeof colors.yellow>
  | valueof<typeof colors.orange>
  | valueof<typeof colors.teal>
  | valueof<typeof colors.green>
  | valueof<typeof colors.purple>
  | valueof<typeof colors.blue>
  | valueof<typeof colors.brown>;

export const colors = {
  black: '#000000',
  white: '#FFFEFB',
  offWhite: '#F8F6F2', // This colour is not in the tokens sadly

  red: {
    50: '#FFDBD6',
    100: '#FFC3B6',
    200: '#FFAB96',
    300: '#F09681',
    400: '#E1816D',
    500: '#D26C58',
    600: '#C35743',
    700: '#B4422F',
    800: '#A52D1A',
    900: '#6D1709',
    1000: '#3C0800',
  },

  yellow: {
    50: '#FDF0C5',
    100: '#FBDE8B',
    200: '#FBCD51',
    300: '#E3B844',
    400: '#CCA338',
    500: '#B48F2B',
    600: '#9D7A1E',
    700: '#866512',
    800: '#6E5005',
    900: '#422E00',
    1000: '#1F1700',
  },

  orange: {
    50: '#FFE3D1',
    100: '#FFC8A2',
    200: '#FFAD73',
    300: '#E99A60',
    400: '#D3884D',
    500: '#BD753A',
    600: '#A66226',
    700: '#905013',
    800: '#7A3D00',
    900: '#4F2600',
    1000: '#271300',
  },

  teal: {
    50: '#DAF0E5',
    100: '#BCDDD1',
    200: '#9DC9BD',
    300: '#8CB5AA',
    400: '#7AA097',
    500: '#698C84',
    600: '#587871',
    700: '#46635E',
    800: '#354F4B',
    900: '#1D3733',
    1000: '#041F1A',
  },

  green: {
    50: '#E6F2C9',
    100: '#D7ECA7',
    200: '#C8E585',
    300: '#B0CB76',
    400: '#98B167',
    500: '#819758',
    600: '#697C49',
    700: '#51623A',
    800: '#39482B',
    900: '#28371A',
    1000: '#101F02',
  },
  purple: {
    50: '#E8E8FF',
    100: '#BFBFED',
    200: '#9595DB',
    300: '#8683C5',
    400: '#7771B0',
    500: '#695F9A',
    600: '#5A4C84',
    700: '#4B3A6F',
    800: '#3C2859',
    900: '#301F47',
    1000: '#210B3E',
  },
  blue: {
    50: '#E8FAFF',
    100: '#C3EAFB',
    200: '#9ED9F7',
    300: '#91C7E5',
    400: '#7DAFCB',
    500: '#6A96B1',
    600: '#567D96',
    700: '#42657C',
    800: '#2E4C62',
    900: '#1A3348',
    1000: '#061A2E',
  },
  /**
   * @deprecated
   * Gray should no longer be used, I think the intention is to replace all instances of it with the brown palette
   */
  gray: {
    50: '#FFFBFB',
    100: '#FBFBFB',
    200: '#F2F3F5',
    300: '#E5E6EB',
    400: '#C9CDD4',
    500: '#A9AEB8',
    600: '#86909C',
    700: '#6B7785',
    800: '#4E5969',
    900: '#272E3B',
    1000: '#1D2129',
  },

  whiteAlpha: {
    75: '#FFFFFFBF',
    50: '#FFFFFF80',
    25: '#FFFFFF40',
    15: '#FFFFFF26',
    10: '#FFFFFF1A',
    5: '#FFFFFF0D',
    0: '#FFFFFF00',
  },

  blackAlpha: {
    75: '#000000BF',
    50: '#00000080',
    25: '#00000040',
    15: '#00000026',
    10: '#0000001A',
    5: '#0000000D',
  },

  brown: {
    50: '#F8F6F2',
    100: '#F0EDEA',
    200: '#DED9D4',
    300: '#C9BEBA',
    400: '#AC9B98',
    500: '#846A67',
    600: '#6F514E',
    700: '#5B3935',
    800: '#47201C',
    900: '#291210',
    1000: '#1B0C0B',
  },
} as const;

// NEW CDS colours
// (NB: if the colour isn't in this list, please ask the designer to refer to the CDS colours https://www.figma.com/file/D9giixZmJBa0nPcQcT37ML/Cleonardo%3A-Product-Colors?node-id=1105%3A13087&t=CbkiSepRlybuHL5R-0)
export const colorRoles = {
  background: {
    primary: colors.brown[50],
    primaryInverse: colors.brown[800],
    secondary: colors.brown[100],
    secondaryInverse: colors.brown[900],
    tertiary: colors.brown[200],
    tertiaryInverse: colors.brown[1000],

    accentLight: colors.brown[100],
    accentMid: colors.brown[700],
    accentDark: colors.brown[800],
    waitingLight: colors.purple[100],
    waitingMid: colors.purple[700],
    waitingDark: colors.purple[1000],

    positiveLight: colors.green[100],
    positiveMid: colors.green[700],
    positiveDark: colors.green[1000],
    warningLight: colors.yellow[100],
    warningMid: colors.yellow[700],
    warningDark: colors.yellow[1000],
    negativeLight: colors.red[100],
    negativeMid: colors.red[700],
    negativeDark: colors.red[1000],

    overlay: colors.blackAlpha[50],
    overlayLight: colors.blackAlpha[10],
    overlayInverse: colors.whiteAlpha[25],
    overlayLightInverse: colors.whiteAlpha[75],
    transparent: colors.whiteAlpha[0],

    baseLight: colors.white,
    baseDark: colors.black,
    disabled: colors.brown[50],
    disabledInverse: colors.brown[900],

    skeletonLight: colors.blackAlpha[5],
    skeletonMid: colors.blackAlpha[10],
    skeletonDark: colors.blackAlpha[15],
    skeletonLightInverse: colors.whiteAlpha[5],
    skeletonMidInverse: colors.whiteAlpha[10],
    skeletonDarkInverse: colors.whiteAlpha[15],
    navbar: colors.offWhite,

    dataVisPrimary: colors.brown[100],
    dataVisSecondary: colors.brown[100],
    dataVisTertiary: colors.brown[100],
    dataVisQuaternary: colors.brown[100],
    dataVisQuinary: colors.brown[100],
    dataVisSenary: colors.brown[100],
  },

  content: {
    primary: colors.brown[800],
    primaryInverse: colors.white,
    secondary: colors.brown[700],
    secondaryInverse: colors.brown[200],
    tertiary: colors.brown[600],
    tertiaryInverse: colors.brown[400],

    // to be used for copy/icons that sit on coloured backgrounds
    onColor: colors.white, // deprecated
    onColorInverse: colors.black, // deprecated
    onColorTransparent: colors.whiteAlpha[50], // deprecated
    onColorInverseOpaque: colors.blackAlpha[50], // deprecated
    onColorLight: colors.white,
    onColorMid: colors.brown[200],
    onColorDark: colors.brown[300],
    disabled: colors.brown[500],

    userInput: colors.brown[800],

    accentLight: colors.brown[200],
    accentMid: colors.brown[500],
    accentDark: colors.brown[1000],

    waitingLight: colors.purple[50],
    waitingMid: colors.purple[500],
    waitingDark: colors.purple[800],

    positiveLight: colors.green[50],
    positiveMid: colors.green[700],
    positiveDark: colors.green[1000],
    warningLight: colors.yellow[50],
    warningMid: colors.yellow[700],
    warningDark: colors.yellow[1000],
    negativeLight: colors.red[100],
    negativeMid: colors.red[700],
    negativeDark: colors.red[1000],
  },

  border: {
    transparent: colors.whiteAlpha[0],
    default: colors.brown[100],
    selected: colors.brown[700],
    selectedInverse: colors.white,
    opaque: colors.blackAlpha[25],
    opaqueLight: colors.blackAlpha[10],
    opaqueInverse: colors.whiteAlpha[25],
    opaqueInverseLight: colors.whiteAlpha[10],

    accentLight: colors.brown[100],
    accentMid: colors.brown[400],
    accentDark: colors.brown[900],
    waitingLight: colors.purple[100],
    waitingMid: colors.purple[400],
    waitingDark: colors.purple[900],

    positiveLight: colors.green[100],
    positiveMid: colors.green[400],
    positiveDark: colors.green[900],
    warningLight: colors.yellow[100],
    warningMid: colors.yellow[400],
    warningDark: colors.yellow[900],
    negativeLight: colors.red[100],
    negativeMid: colors.red[400],
    negativeDark: colors.red[900],

    disabled: colors.brown[500], // deprecated
    disabledLight: colors.brown[400], // deprecated
    disabledDark: colors.brown[600], // deprecated
    focused: colors.brown[500],
    disabledOnLight: colors.brown[200],
    disabledOnDark: colors.brown[600],
  },
} as const;

type Colors = typeof colors;
export type CocoaPalette = valueof<Colors[keyof Colors]> | '#000000' | '#FFFEFB' | '#F8F6F2';

export const darkModeColorRoles = {
  background: {
    primary: colors.black,
    primaryInverse: colors.white,
    secondary: colors.brown[900],
    secondaryInverse: colors.brown[100],
    tertiary: colors.brown[1000],
    tertiaryInverse: colors.brown[200],

    accentLight: colors.brown[700],
    accentMid: colors.brown[200],
    accentDark: colors.brown[1000],
    waitingLight: colors.purple[700],
    waitingMid: colors.purple[200],
    waitingDark: colors.purple[50],

    positiveLight: colors.green[700],
    positiveMid: colors.green[200],
    positiveDark: colors.green[50],
    warningLight: colors.yellow[700],
    warningMid: colors.yellow[200],
    warningDark: colors.yellow[50],
    negativeLight: colors.red[700],
    negativeMid: colors.red[200],
    negativeDark: colors.red[50],

    overlay: colors.whiteAlpha[25],
    overlayLight: colors.whiteAlpha[10],
    overlayInverse: colors.blackAlpha[25],
    overlayLightInverse: colors.blackAlpha[75],
    transparent: colors.whiteAlpha[0],

    baseLight: colors.brown[900],
    baseDark: colors.brown[100],
    disabled: colors.brown[900],
    disabledInverse: colors.brown[50],

    skeletonLight: colors.whiteAlpha[5],
    skeletonMid: colors.whiteAlpha[10],
    skeletonDark: colors.whiteAlpha[15],
    skeletonLightInverse: colors.blackAlpha[5],
    skeletonMidInverse: colors.blackAlpha[10],
    skeletonDarkInverse: colors.blackAlpha[15],
    navbar: colors.brown[900],

    dataVisPrimary: colors.brown[900],
    dataVisSecondary: colors.brown[900],
    dataVisTertiary: colors.brown[900],
    dataVisQuaternary: colors.brown[900],
    dataVisQuinary: colors.brown[900],
    dataVisSenary: colors.brown[900],
  },

  content: {
    primary: colors.white,
    primaryInverse: colors.brown[800],
    secondary: colors.brown[200],
    secondaryInverse: colors.brown[700],
    tertiary: colors.brown[400],
    tertiaryInverse: colors.brown[600],

    // to be used for copy/icons that sit on coloured backgrounds
    onColor: colors.white, // deprecated
    onColorInverse: colors.black, // deprecated
    onColorTransparent: colors.whiteAlpha[50], // deprecated
    onColorInverseOpaque: colors.blackAlpha[50], // deprecated
    onColorLight: colors.white,
    onColorMid: colors.brown[200],
    onColorDark: colors.brown[300],
    disabled: colors.brown[500],

    userInput: colors.white,

    accentLight: colors.brown[200],
    accentMid: colors.brown[400],
    accentDark: colors.white,

    waitingLight: colors.purple[200],
    waitingMid: colors.purple[400],
    waitingDark: colors.purple[50],

    positiveLight: colors.green[200],
    positiveMid: colors.green[400],
    positiveDark: colors.green[50],
    warningLight: colors.yellow[200],
    warningMid: colors.yellow[400],
    warningDark: colors.yellow[50],
    negativeLight: colors.red[200],
    negativeMid: colors.red[400],
    negativeDark: colors.red[50],
  },

  border: {
    transparent: colors.whiteAlpha[0],
    default: colors.brown[700],
    selected: colors.brown[200],
    selectedInverse: colors.white,
    opaque: colors.whiteAlpha[25],
    opaqueLight: colors.whiteAlpha[10],
    opaqueInverse: colors.blackAlpha[25],
    opaqueInverseLight: colors.blackAlpha[10],

    accentLight: colors.brown[700],
    accentMid: colors.brown[400],
    accentDark: colors.brown[100],
    waitingLight: colors.purple[700],
    waitingMid: colors.purple[400],
    waitingDark: colors.purple[100],

    positiveLight: colors.green[700],
    positiveMid: colors.green[400],
    positiveDark: colors.green[100],
    warningLight: colors.yellow[700],
    warningMid: colors.yellow[400],
    warningDark: colors.yellow[100],
    negativeLight: colors.red[700],
    negativeMid: colors.red[400],
    negativeDark: colors.red[100],

    disabled: colors.brown[500], // deprecated
    disabledLight: colors.brown[400], // deprecated
    disabledDark: colors.brown[600], // deprecated
    focused: colors.brown[400],
    disabledOnLight: colors.brown[200],
    disabledOnDark: colors.brown[600],
  },
} as unknown as typeof colorRoles;
