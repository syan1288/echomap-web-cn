
import React, { useEffect } from 'react';
import type { PhotoData } from '../web/app/webMemoryTypes';
import { useLocalization } from '../context/LocalizationContext';

interface PhotoPreviewModalProps {
    photos: PhotoData[];
    currentIndex: number;
    onClose: () => void;
    onNext: () => void;
    onPrevious: () => void;
    onDelete?: () => void;
}

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({ photos, currentIndex, onClose, onNext, onPrevious, onDelete }) => {
    const { t } = useLocalization();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                onNext();
            } else if (e.key === 'ArrowLeft') {
                onPrevious();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onNext, onPrevious, onClose]);

    if (!photos || photos.length === 0) return null;

    const imageUrl = photos[currentIndex].url;

    return (
        <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" 
            onClick={onClose}
        >
            <img 
                src={imageUrl} 
                alt={t('previewAltText', { current: currentIndex + 1, total: photos.length })}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()} 
            />
            
            <div className="absolute top-4 right-4 flex items-center gap-3">
                {onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="h-11 w-11 rounded-full border border-white/70 bg-black/30 text-white flex items-center justify-center hover:bg-black/60"
                        aria-label="Delete photo"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                )}
                <button 
                    onClick={onClose} 
                    className="h-11 w-11 rounded-full border border-white/70 bg-black/30 text-white text-3xl leading-none hover:bg-black/60 flex items-center justify-center"
                    aria-label={t('previewClose')}
                >
                    &times;
                </button>
            </div>

            {photos.length > 1 && (
                <>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onPrevious(); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl bg-black/30 rounded-full w-12 h-12 flex items-center justify-center hover:bg-black/60"
                        aria-label={t('previewPrevious')}
                    >
                        &#8249;
                    </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); onNext(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl bg-black/30 rounded-full w-12 h-12 flex items-center justify-center hover:bg-black/60"
                        aria-label={t('previewNext')}
                    >
                        &#8250;
                    </button>
                </>
            )}
        </div>
    );
};
