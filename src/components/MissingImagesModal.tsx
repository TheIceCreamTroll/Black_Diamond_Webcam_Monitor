import { formatDistanceToNow } from 'date-fns'

interface MissingImagesModalProps {
    showMissingModal: boolean
    setShowMissingModal: (show: boolean) => void
    missingImageTimestamps: { timestamp: number; date: Date }[]
}

export function MissingImagesModal({
    showMissingModal,
    setShowMissingModal,
    missingImageTimestamps,
}: MissingImagesModalProps) {
    if (!showMissingModal) return null

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-2xl max-h-[80vh]">
                <h3 className="font-bold text-2xl mb-2">Missing Images</h3>
                <p className="text-base-content/70 mb-4">
                    {missingImageTimestamps.length} images are missing from the
                    expected 15-minute intervals
                </p>

                <div className="overflow-y-auto max-h-[50vh]">
                    {missingImageTimestamps.length > 0 ? (
                        <div className="space-y-2">
                            {missingImageTimestamps.map((missing, index) => (
                                <div
                                    key={missing.timestamp}
                                    className="flex items-center justify-between p-3 bg-base-200 rounded-lg"
                                >
                                    <div>
                                        <div className="font-medium">
                                            {missing.date.toLocaleString(
                                                'en-US',
                                                {
                                                    timeZone: 'America/Denver',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true,
                                                }
                                            )}{' '}
                                            MT
                                        </div>
                                        <div className="text-sm text-base-content/60">
                                            {formatDistanceToNow(missing.date, {
                                                addSuffix: true,
                                            })}
                                        </div>
                                    </div>
                                    <div className="text-sm text-base-content/50">
                                        #{index + 1}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center py-8 text-base-content/60">
                            No missing images detected
                        </p>
                    )}
                </div>

                <div className="modal-action mt-6">
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowMissingModal(false)}
                    >
                        Close
                    </button>
                </div>
            </div>
            <div
                className="modal-backdrop"
                onClick={() => setShowMissingModal(false)}
            ></div>
        </div>
    )
}
