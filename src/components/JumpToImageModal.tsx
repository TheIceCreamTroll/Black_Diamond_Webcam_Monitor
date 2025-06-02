import type { WebcamInfo } from '../types'

interface JumpToImageModalProps {
  showJumpModal: boolean
  setShowJumpModal: (show: boolean) => void
  jumpToImage: string
  setJumpToImage: (value: string) => void
  webcamInfo: WebcamInfo | null
  displayImagesLength: number
  handleJumpToImage: () => void
  isJumping: boolean
}

export function JumpToImageModal({
  showJumpModal,
  setShowJumpModal,
  jumpToImage,
  setJumpToImage,
  webcamInfo,
  displayImagesLength,
  handleJumpToImage,
  isJumping
}: JumpToImageModalProps) {
  if (!showJumpModal) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="font-bold text-2xl mb-2">Jump to Image</h3>
        <p className="text-base-content/70 mb-6">
          Enter image number (1-{webcamInfo?.imageTotal.toLocaleString() || displayImagesLength})
        </p>
        <div className="form-control">
          <input
            type="number"
            value={jumpToImage}
            onChange={(e) => {
              const value = e.target.value
              // Only allow positive numbers
              if (value === '' || parseInt(value) >= 0) {
                setJumpToImage(value)
              }
            }}
            className="input input-bordered w-full text-center text-lg"
            placeholder={`1-${webcamInfo?.imageTotal || displayImagesLength}`}
            min="1"
            max={(webcamInfo?.imageTotal || displayImagesLength).toString()}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleJumpToImage()
              }
            }}
          />
          {displayImagesLength < (webcamInfo?.imageTotal || 0) && (
            <label className="label">
              <span className="label-text-alt">
                Currently loaded: {displayImagesLength.toLocaleString()} images
              </span>
            </label>
          )}
        </div>
        <div className="modal-action mt-8">
          <button className="btn btn-ghost" onClick={() => {
            setShowJumpModal(false)
            setJumpToImage('')
          }}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleJumpToImage}
            disabled={!jumpToImage || parseInt(jumpToImage) < 1 || parseInt(jumpToImage) > (webcamInfo?.imageTotal || displayImagesLength) || isJumping}
          >
            {isJumping ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Loading...
              </>
            ) : (
              'Jump'
            )}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={() => {
        setShowJumpModal(false)
        setJumpToImage('')
      }}></div>
    </div>
  )
}