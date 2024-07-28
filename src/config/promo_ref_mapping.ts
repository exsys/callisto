export const PROMO_REF_MAPPING = {
    level_1: {
        // for s-tier collabs
        getPercent: (numberOfRef: number) => {
            if (numberOfRef <= 100) return 70;
            if (numberOfRef <= 200) return 50;
            return 30;
        }
    },
    level_2: {
        // for early collabs
        getPercent: (numberOfRef: number) => {
            return 50;
        }
    },
    level_3: {
        // for a-tier collabs
        getPercent: (numberOfRef: number) => {
            if (numberOfRef <= 100) return 60;
            if (numberOfRef <= 200) return 40;
            return 30;
        }
    }
}