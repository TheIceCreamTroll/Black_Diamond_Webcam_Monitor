import type { WebcamInfo } from '../types'

interface DatePickerModalProps {
    showDatePicker: boolean
    setShowDatePicker: (show: boolean) => void
    startDate: string
    setStartDate: (date: string) => void
    webcamInfo: WebcamInfo | null
    handleDateSubmit: () => Promise<void>
}

export function DatePickerModal({
    showDatePicker,
    setShowDatePicker,
    startDate,
    setStartDate,
    webcamInfo,
    handleDateSubmit,
}: DatePickerModalProps) {
    if (!showDatePicker) return null

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-md">
                <h3 className="font-bold text-2xl mb-2">
                    Load Images From Date
                </h3>
                <p className="text-base-content/70 mb-6">
                    Load all images from this date to present
                </p>
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-base font-medium">
                            Start Date/Time
                        </span>
                    </label>
                    <input
                        type="datetime-local"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="input input-bordered w-full"
                        max={new Date().toISOString().slice(0, 16)}
                        min={
                            webcamInfo
                                ? new Date(
                                      webcamInfo.firstImageTimestamp * 1000
                                  )
                                      .toISOString()
                                      .slice(0, 16)
                                : undefined
                        }
                    />
                    {webcamInfo && (
                        <label className="label mt-2">
                            <span className="label-text-alt">
                                Earliest:{' '}
                                {new Date(
                                    webcamInfo.firstImageTimestamp * 1000
                                ).toLocaleDateString()}
                            </span>
                        </label>
                    )}
                </div>
                <div className="modal-action mt-8">
                    <button
                        className="btn btn-ghost"
                        onClick={() => {
                            setShowDatePicker(false)
                            setStartDate('')
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            void handleDateSubmit()
                        }}
                        disabled={!startDate}
                    >
                        Load Images
                    </button>
                </div>
            </div>
            <div
                className="modal-backdrop"
                onClick={() => {
                    setShowDatePicker(false)
                    setStartDate('')
                }}
            ></div>
        </div>
    )
}
