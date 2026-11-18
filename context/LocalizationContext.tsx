
import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import { translations, Language } from '../localization/translations';

const LANGUAGE_STORAGE_KEY = 'echomap-language';

export function resolveInitialLanguage(savedLanguage: string | null | undefined): Language {
    if (savedLanguage === 'zh' || savedLanguage === 'en') return savedLanguage;
    return 'en';
}

function initialLanguage(): Language {
    if (typeof window === 'undefined') return 'en';
    try {
        return resolveInitialLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
        return 'en';
    }
}

interface LocalizationContextType {
    language: Language;
    toggleLanguage: () => void;
    t: (key: string, options?: { [key: string]: string | number }) => string;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export const LocalizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>(initialLanguage);

    const toggleLanguage = useCallback(() => {
        setLanguage(prevLang => {
            const nextLanguage = prevLang === 'en' ? 'zh' : 'en';
            try {
                window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
            } catch {
                // Language changes still apply for the current session.
            }
            return nextLanguage;
        });
    }, []);

    const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
        const keyParts = key.split('.');
        let translationNode: any = translations;
        
        for (const part of keyParts) {
            if (translationNode && typeof translationNode === 'object' && part in translationNode) {
                translationNode = translationNode[part];
            } else {
                translationNode = undefined;
                break;
            }
        }
        
        let text = translationNode?.[language] || key;

        if (options) {
            Object.entries(options).forEach(([k, v]) => {
                text = text.replace(`{{${k}}}`, String(v));
            });
        }
        
        return text;
    }, [language]);

    return (
        <LocalizationContext.Provider value={{ language, toggleLanguage, t }}>
            {children}
        </LocalizationContext.Provider>
    );
};

export const useLocalization = (): LocalizationContextType => {
    const context = useContext(LocalizationContext);
    if (context === undefined) {
        throw new Error('useLocalization must be used within a LocalizationProvider');
    }
    return context;
};
