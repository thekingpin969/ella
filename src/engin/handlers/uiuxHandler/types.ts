// uiuxHandler/types.ts
// Shared types for Screen 2: UI/UX Deep Dive

// ==========================================
// MOOD TYPES
// ==========================================

export type Mood =
    | 'minimal'
    | 'bold'
    | 'playful'
    | 'corporate'
    | 'futuristic'
    | 'soft'
    | 'dark'
    | 'luxury'
    | 'energetic';

export interface MoodOption {
    value: Mood;
    label: string;
    description: string;
    keywords: string[];
}

export const MOOD_OPTIONS: MoodOption[] = [
    {
        value: 'minimal',
        label: 'Minimal',
        description: 'Clean, focused, lots of white space. Less is more.',
        keywords: ['clean', 'simple', 'focused', 'whitespace', 'elegant']
    },
    {
        value: 'bold',
        label: 'Bold',
        description: 'Strong colors, impactful typography, makes a statement.',
        keywords: ['strong', 'impactful', 'vibrant', 'confident', 'striking']
    },
    {
        value: 'playful',
        label: 'Playful',
        description: 'Fun, colorful, engaging. Great for consumer apps.',
        keywords: ['fun', 'colorful', 'friendly', 'engaging', 'whimsical']
    },
    {
        value: 'corporate',
        label: 'Corporate',
        description: 'Professional, trustworthy, enterprise-ready.',
        keywords: ['professional', 'trustworthy', 'reliable', 'formal', 'business']
    },
    {
        value: 'futuristic',
        label: 'Futuristic',
        description: 'Tech-forward, innovative, cutting-edge feel.',
        keywords: ['tech', 'innovative', 'modern', 'sleek', 'advanced']
    },
    {
        value: 'soft',
        label: 'Soft',
        description: 'Gentle, calming, rounded edges. Wellness vibes.',
        keywords: ['gentle', 'calm', 'rounded', 'soothing', 'warm']
    },
    {
        value: 'dark',
        label: 'Dark',
        description: 'Dark mode first, dramatic, immersive.',
        keywords: ['dark', 'dramatic', 'immersive', 'sleek', 'modern']
    },
    {
        value: 'luxury',
        label: 'Luxury',
        description: 'Premium, sophisticated, high-end aesthetic.',
        keywords: ['premium', 'sophisticated', 'elegant', 'refined', 'exclusive']
    },
    {
        value: 'energetic',
        label: 'Energetic',
        description: 'Dynamic, vibrant, full of motion and life.',
        keywords: ['dynamic', 'vibrant', 'active', 'lively', 'animated']
    }
];

// ==========================================
// INSPIRATION TYPES
// ==========================================

export type InspirationSource = 'dribbble' | 'behance' | 'real_product' | 'generated' | 'user_provided';
export type InspirationRating = 'favorite' | 'neutral' | 'rejected';

export interface InspirationItem {
    id: string;
    source: InspirationSource;
    url?: string;
    thumbnailUrl?: string;
    title: string;
    description: string;
    tags: string[];
    userRating?: InspirationRating;
}

export interface TasteAnalysis {
    designSignature: string;
    preferences: {
        whitespace: 'minimal' | 'moderate' | 'generous';
        corners: 'sharp' | 'slightly-rounded' | 'rounded' | 'pill';
        colorStyle: 'vibrant' | 'muted' | 'monochrome' | 'gradient';
        density: 'compact' | 'balanced' | 'spacious';
        animations: 'none' | 'subtle' | 'moderate' | 'dynamic';
    };
}

// ==========================================
// SCREEN GENERATION TYPES
// ==========================================

// Device-specific responsive content
export interface ResponsiveContent {
    htmlContent: string;
    cssContent: string;
}

export interface DeviceScreens {
    mobile: ResponsiveContent;   // 423×840 viewport
    tablet: ResponsiveContent;   // 768×1024 viewport
    pc: ResponsiveContent;       // 1440×900 viewport
}

export type ScreenType =
    | 'landing'
    | 'dashboard'
    | 'login'
    | 'signup'
    | 'settings'
    | 'profile'
    | 'feed'
    | 'product_list'
    | 'product_detail'
    | 'checkout'
    | 'onboarding'
    | 'search'
    | 'notifications'
    | 'chat'
    | 'analytics'
    | 'admin'
    | 'other';

export type ScreenVariantLabel = string;
export type ScreenStatus = 'pending' | 'generated' | 'selected' | 'rejected' | 'mixed';

export interface KeyScreen {
    type: ScreenType;
    name: string;
    priority: number;
    description: string;
    features: string[];
}

export interface ScreenDesignBrief {
    screenName: string;
    screenType: ScreenType;
    layout: {
        structure: string;
        headerType: string;
        navigationStyle: string;
        contentZones: string[];
    };
    components: Array<{
        name: string;
        description: string;
        placement: string;
    }>;
    content: {
        headings: string[];
        labels: string[];
        sampleData: string[];
    };
    designNotes: string;
}

// ==========================================
// VARIANT DESIGN PROMPT TYPES (Phase 2)
// ==========================================

export interface ComponentDesignSpec {
    name: string;                           // e.g. "Stat Card"
    htmlStructure: string;                  // e.g. "div.stat-card > h3.label + p.value + span.change"
    cssDirectives: string;                  // e.g. "rounded-lg, shadow-md, bg: surface color, padding: lg"
    interactionNotes?: string;              // e.g. "hover: lift shadow, subtle scale"
}

export interface VariantDesignPrompt {
    screenName: string;
    screenType: ScreenType;
    variant: ScreenVariantLabel;
    layoutStrategy: string;                 // e.g. "Sidebar + main content, 3-column grid for cards"
    componentSpecs: ComponentDesignSpec[];   // Detailed spec for each component
    colorDirectives: string;                // e.g. "Primary #6366f1, background #0f172a, surface #1e293b"
    typographyDirectives: string;           // e.g. "Headings: Inter Bold 2xl, Body: Inter Regular base"
    spacingNotes: string;                   // e.g. "Generous whitespace, section gaps 2xl"
    overallNotes: string;                   // Variant personality applied to the whole page
}

export interface ScreenVariantVersion {
    version: number;
    htmlContent: string;
    cssContent: string;
    deviceScreens?: DeviceScreens;
    description: string;
    timestamp: string;
}

export interface ScreenVariant {
    id: string;
    slotId?: string; // Stable slot identifier for UI positioning
    screenType: ScreenType;
    screenName: string;
    variant: ScreenVariantLabel;
    // Legacy single content (for backward compatibility)
    htmlContent: string;
    cssContent: string;
    // New responsive device screens
    deviceScreens?: DeviceScreens;
    description: string;
    status: ScreenStatus;
    // Version tracking for edit history
    version?: number;
    versions?: ScreenVariantVersion[];
}

export interface ScreenFeedback {
    screenType: ScreenType;
    screenName?: string; // Optional: target specific screen by name (if multiple screens of same type)
    action: 'select' | 'reject_all' | 'mix' | 'regenerate';
    selectedVariant?: ScreenVariantLabel;
    selectedVersion?: number; // Added to support selecting a specific version of a variant
    mixInstructions?: string;
    feedback?: string;
}

// ==========================================
// DESIGN TOKENS TYPES
// ==========================================

export interface DesignTokens {
    colors: {
        primary: string;
        secondary: string;
        background: string;
        surface: string;
        text: {
            primary: string;
            secondary: string;
            muted: string;
        };
        border: string;
        success: string;
        warning: string;
        error: string;
        accent?: string;
    };
    typography: {
        fontFamily: {
            sans: string;
            mono?: string;
            display?: string;
        };
        fontSize: {
            xs: string;
            sm: string;
            base: string;
            lg: string;
            xl: string;
            '2xl': string;
            '3xl': string;
            '4xl'?: string;
        };
        fontWeight: {
            normal: number;
            medium: number;
            semibold: number;
            bold: number;
        };
        lineHeight: {
            tight: string;
            normal: string;
            relaxed: string;
        };
    };
    spacing: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        '2xl': string;
        '3xl'?: string;
    };
    borderRadius: {
        none: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        full: string;
    };
    shadows: {
        sm: string;
        md: string;
        lg: string;
        xl?: string;
        glow?: string;
    };
    breakpoints: {
        sm: string;
        md: string;
        lg: string;
        xl: string;
        '2xl'?: string;
    };
    animation?: {
        duration: {
            fast: string;
            normal: string;
            slow: string;
        };
        easing: {
            default: string;
            in: string;
            out: string;
            inOut: string;
        };
    };
}

// ==========================================
// UIUX DATA (Context State)
// ==========================================

export interface UIUXData {
    // Phase tracking
    currentPhase: 'mood' | 'inspiration' | 'screens' | 'tokens' | 'complete';

    // Mood
    mood?: Mood;
    moodLocked: boolean;
    moodReasoning?: string;

    // Inspiration
    inspirations: InspirationItem[];
    inspirationLocked: boolean;
    tasteAnalysis?: TasteAnalysis;

    // Screens
    keyScreens: KeyScreen[];
    screenVariants: ScreenVariant[];
    selectedScreens: ScreenType[];
    currentScreenIndex: number;

    // Design System
    designTokens?: DesignTokens;



    // Progress
    confidenceScore: number;
}



// ==========================================
// CONSTANTS
// ==========================================

export const UIUX_CONFIDENCE_THRESHOLD = 90;
export const MOOD_WEIGHT = 20;
export const INSPIRATION_WEIGHT = 20;
export const SCREENS_WEIGHT = 40;
export const TOKENS_WEIGHT = 10;
export const ARTIFACTS_WEIGHT = 10;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

export function createInitialUIUXData(): UIUXData {
    return {
        currentPhase: 'mood',
        moodLocked: false,
        inspirations: [],
        inspirationLocked: false,
        keyScreens: [],
        screenVariants: [],
        selectedScreens: [],
        currentScreenIndex: 0,
        confidenceScore: 0
    };
}

export function generateInspirationId(): string {
    return `insp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateScreenVariantId(): string {
    return `screen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateSlotId(): string {
    return `slot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
