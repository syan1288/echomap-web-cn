
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PhotoData, ProcessedImage } from '../web/app/webMemoryTypes';
import { useLocalization } from '../context/LocalizationContext';

interface MemoryCardsProps {
    selectedImage: ProcessedImage;
    map: any;
    selectedScreenPoint?: { x: number; y: number };
    selectedMarkerSize?: number;
    mapViewportTick?: number;
    onUnlock: () => void;
    onViewPhoto: (photoIndex: number) => void;
    onOpenPhotoModal: () => void;
    onOpenAudioModal: () => void;
    onEditLog: () => void;
}

const Card: React.FC<{
    children: React.ReactNode;
    onClick: () => void;
    rotation: number;
    ariaLabel: string;
}> = ({ children, onClick, rotation, ariaLabel }) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className="h-12 w-12 bg-white border border-black shadow-md flex items-center justify-center transition-all duration-300 ease-in-out origin-bottom hover:!scale-110 hover:!z-20 hover:-translate-y-2"
            style={{ transform: `rotate(${rotation}deg) scale(1)`}}
            aria-label={ariaLabel}
        >
            {children}
        </button>
    );
};

const PhotoCard: React.FC<{
    photo: PhotoData | null;
    onClick: () => void;
    rotation: number;
}> = ({ photo, onClick, rotation }) => {
    const { t } = useLocalization();

    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative h-12 w-12 overflow-hidden border border-black bg-white shadow-md outline-none transition-all duration-300 ease-in-out origin-bottom hover:!z-20 hover:-translate-y-2 hover:!scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-black"
            style={{ transform: `rotate(${rotation}deg) scale(1)`}}
            aria-label={t('cardsViewPhoto')}
        >
            {photo ? (
              <img src={photo.url} alt={t('cardsPhotoThumbnailAlt')} className="w-full h-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-black">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                  <circle cx="8.5" cy="10.5" r="1.5"></circle>
                  <path d="m21 15-5-5L5 21"></path>
                </svg>
              </div>
            )}
        </button>
    );
};


export const MemoryCards: React.FC<MemoryCardsProps> = ({
    selectedImage,
    map,
    selectedScreenPoint,
    selectedMarkerSize,
    mapViewportTick = 0,
    onUnlock,
    onViewPhoto,
    onOpenPhotoModal,
    onOpenAudioModal,
    onEditLog,
}) => {
    const { t } = useLocalization();
    const cardsRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useLayoutEffect(() => {
        const screenPoint = selectedScreenPoint ?? map.latLngToContainerPoint([selectedImage.lat, selectedImage.lng]);
        const cardsWidth = cardsRef.current?.offsetWidth || 196;
        const cardsHeight = cardsRef.current?.offsetHeight || 112;
        const viewportWidth = map.getContainer?.()?.clientWidth || window.innerWidth || 390;
        const viewportHeight = map.getContainer?.()?.clientHeight || window.innerHeight || 740;
        const bottomReserve = viewportWidth < 768 ? 118 : 56;
        const markerHeight = selectedMarkerSize ?? Math.max(selectedImage.height, 112);
        const verticalGap = selectedMarkerSize ? 12 : 18;
        
        let top = screenPoint.y - markerHeight / 2 - cardsHeight - verticalGap;
        
        if (top < 12) {
            top = screenPoint.y + markerHeight / 2 + verticalGap;
        }
        
        setPosition({
            top: Math.min(Math.max(top, 12), viewportHeight - cardsHeight - bottomReserve),
            left: Math.min(
              Math.max(screenPoint.x, cardsWidth / 2 + 8),
              viewportWidth - cardsWidth / 2 - 8
            ),
        });

    }, [selectedImage.lat, selectedImage.lng, selectedImage.height, selectedMarkerSize, selectedScreenPoint, map, mapViewportTick]);

    const latestPhotoSlots = useMemo(() => {
        return (selectedImage.photos ?? [])
            .map((photo, index) => {
                const createdTime = photo.createdAt ? new Date(photo.createdAt).getTime() : NaN;
                const modifiedTime = typeof photo.file?.lastModified === 'number' ? photo.file.lastModified : NaN;
                return {
                    photo,
                    index,
                    sortTime: Number.isFinite(createdTime)
                        ? createdTime
                        : Number.isFinite(modifiedTime)
                          ? modifiedTime
                          : index,
                };
            })
            .sort((a, b) => {
                if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
                return b.index - a.index;
            })
            .slice(0, 2);
    }, [selectedImage.photos]);
    const totalCards = 3 + latestPhotoSlots.length; // Diary, Camera, latest photos, Audio
    const angleSpread = Math.min(totalCards * 12, 90);
    const angleStep = totalCards > 1 ? angleSpread / (totalCards - 1) : 0;
    const startAngle = -angleSpread / 2;

    const cards: React.ReactNode[] = [
        <Card key="log" onClick={onEditLog} rotation={startAngle} ariaLabel={t('cardsEditLog')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
        </Card>,
        <Card key="live" onClick={onOpenPhotoModal} rotation={startAngle + angleStep} ariaLabel="Open photo modal">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
            </svg>
        </Card>,
        ...latestPhotoSlots.map(({ photo, index }, slotIndex) => (
            <PhotoCard
              key={photo.photo_id ?? `${photo.url}-${index}`}
              photo={photo}
              onClick={() => onViewPhoto(index)}
              rotation={startAngle + angleStep * (slotIndex + 2)}
            />
        )),
        <Card key="audio" onClick={onOpenAudioModal} rotation={startAngle + angleStep * (latestPhotoSlots.length + 2)} ariaLabel="Open audio modal">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15V9" />
              <path d="M8 18V6" />
              <path d="M12 20V4" />
              <path d="M16 18V6" />
              <path d="M20 15V9" />
            </svg>
        </Card>,
    ];

    return (
        <div 
            ref={cardsRef}
            className="absolute"
            data-selection-overlay="memory-cards"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: 'translateX(-50%)',
                zIndex: 30,
            }}
        >
            <div className="flex items-end justify-center h-24 -space-x-4">
                 {cards}
            </div>
            <button 
                type="button"
                onPointerDown={(event) => {
                    event.stopPropagation();
                }}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onUnlock();
                }}
                className="pointer-events-auto absolute left-1/2 top-full z-[60] mt-2 flex h-10 w-10 -translate-x-1/2 touch-manipulation items-center justify-center rounded-full border border-black bg-white p-2 text-black shadow-lg outline-none hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                aria-label={t('cardsUnlock')}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
            </button>
        </div>
    );
};
