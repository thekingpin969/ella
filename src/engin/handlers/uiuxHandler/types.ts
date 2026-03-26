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
// STAGE 1: BRAND IDENTITY TYPES (strategic / abstract)
// ==========================================

export type BrandArchetype =
    | 'The Expert'
    | 'The Creator'
    | 'The Guide'
    | 'The Rebel'
    | 'The Companion'
    | 'The Innovator';

export interface BrandIdentity {
    marketPosition: {
        what: string;        // one clear sentence describing what the product is
        who: string;         // specific user archetype
        problem: string;     // core pain point
        differentiation: string; // what makes it distinct
    };
    personalityTraits: string[];    // exactly 3–5 adjectives, no overlap in meaning
    archetype: BrandArchetype;
    energyLevel: {
        score: number;              // 1 (meditative calm) – 10 (high intensity)
        description: string;
    };
    visualFeeling: string[];        // 3 abstract mood descriptors — NO color names, NO font names
    trustLevel: {
        score: number;              // 1 (low stakes) – 10 (fintech/medical/legal)
        description: string;
        implication: string;        // what this means for design decisions
    };
    emotionalJourney: {
        onLanding: string;          // what the user feels first
        duringCoreAction: string;   // what they feel doing the main thing
        onError: string;            // what they feel when something goes wrong
    };
}

export interface BrandIdentityFeedback {
    aspect: string;   // e.g. 'archetype', 'energyLevel', 'personalityTraits', 'trustLevel'
    change: string;   // free text describing desired change
}

// ==========================================
// STAGE 2: BRAND DNA TYPES (concrete / exact values)
// ==========================================

export interface BrandDNAOutput {
    color: {
        primary: string;        // exact hex e.g. '#1A1A2E'
        secondary: string;      // exact hex
        accent: string;         // exact hex
        background: string;     // exact hex
        surface: string;        // exact hex
        text: {
            primary: string;    // exact hex
            secondary: string;  // exact hex
            disabled: string;   // exact hex
            inverse: string;    // exact hex
        };
        semantic: {
            error: string;      // exact hex
            success: string;    // exact hex
            warning: string;    // exact hex
        };
        mode: 'light' | 'dark' | 'both';
    };
    typography: {
        primary: string;        // exact font name e.g. 'Inter'
        secondary: string;      // exact font name or 'none'
        weightRange: string;    // e.g. '400–700 only'
        sizeDirection: 'compact' | 'balanced' | 'generous';
    };
    shape: {
        borderRadius: 'sharp' | 'soft' | 'rounded' | 'pill';
        borderRadiusValue: string;  // exact value e.g. '6px'
        consistency: 'consistent' | 'varied';
    };
    spacing: {
        density: 'compact' | 'balanced' | 'airy';
        baseUnit: string;       // exact value e.g. '4px'
    };
    elevation: {
        shadowStyle: 'flat' | 'subtle' | 'elevated' | 'neumorphic';
        borderUsage: string;    // e.g. 'inputs only, no card borders'
    };
    iconography: {
        style: 'outlined' | 'filled' | 'duotone' | 'sharp';
        family: string;         // exact name e.g. 'Lucide' or 'none'
    };
    motion: {
        durationFast: string;   // e.g. '150ms'
        durationNormal: string; // e.g. '250ms'
        durationSlow: string;   // e.g. '400ms'
        easing: string;         // e.g. 'cubic-bezier(0.4, 0, 0.2, 1)'
    };
    voice: {
        tone: 'direct' | 'friendly' | 'technical' | 'inspirational';
        rules: string[];        // 3 concrete writing rules
    };
}

export interface BrandDNAFeedback {
    aspect: string;   // e.g. 'color', 'typography', 'shape', 'spacing', 'motion'
    change: string;   // free text describing desired change
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
    currentPhase: 'mood' | 'brand_identity' | 'brand_dna' | 'inspiration' | 'screens' | 'tokens' | 'complete';

    // Mood
    mood?: Mood;
    moodLocked: boolean;
    moodReasoning?: string;

    // Stage 1: Brand Identity (strategic/abstract)
    brandIdentity?: BrandIdentity;
    brandIdentityLocked: boolean;

    // Stage 2: Brand DNA (concrete/exact values)
    brandDNA?: BrandDNAOutput;
    brandDNALocked: boolean;

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
export const BRAND_IDENTITY_WEIGHT = 15; // Stage 1
export const BRAND_DNA_WEIGHT = 15;      // Stage 2
export const INSPIRATION_WEIGHT = 10;
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
        brandIdentityLocked: false,
        brandDNALocked: false,
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
