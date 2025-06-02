import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'

interface WebcamImage {
  imageId: number
  md5: string
  webcamCode: string
  newestForWebcam: string
  imageTimestamp: number
  imageDate: string
  isNighttimeInd: string
  interestingCode: string
  imageUrl: string
}

interface ApiResponse {
  images: WebcamImage[]
  webcam: {
    webcamName: string
    imageTotal: number
  }
  meta: {
    imageTotal: number
  }
}

const WEBCAM_CODE = 'ys-bbsn'
const API_BASE = 'https://volcview.wr.usgs.gov/ashcam-api'

function App() {
  const [images, setImages] = useState<WebcamImage[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadCount, setLoadCount] = useState(50)
  const [hasNewImage, setHasNewImage] = useState(false)
  const [showToast, setShowToast] = useState(false)

  // Fetch initial images
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['volcanic-images', loadCount],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/imageApi/webcam/${WEBCAM_CODE}/0/99999999999999999/newestFirst/${loadCount}`
      )
      if (!response.ok) throw new Error('Failed to fetch images')
      const data: ApiResponse = await response.json()
      return data.images
    },
    refetchInterval: currentIndex === 0 ? 15 * 60 * 1000 : false, // 15 minutes if viewing latest
  })

  useEffect(() => {
    if (data) {
      if (images.length > 0 && data[0].imageId !== images[0].imageId) {
        setHasNewImage(true)
        if (currentIndex === 0) {
          setImages(data)
          setShowToast(true)
          setTimeout(() => setShowToast(false), 3000)
        }
      } else {
        setImages(data)
      }
    }
  }, [data])

  const currentImage = images[currentIndex]

  const handleLoadMore = () => {
    const newCount = Math.min(loadCount + 50, 500)
    setLoadCount(newCount)
  }

  const handleUpdateToLatest = () => {
    refetch()
    setCurrentIndex(0)
    setHasNewImage(false)
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="alert alert-error">
          <span>Error loading images. Please try again.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-100 p-4">
      {showToast && (
        <div className="toast toast-top toast-center">
          <div className="alert alert-success">
            <span>New image loaded!</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6">
          Black Diamond Pool Webcam
        </h1>

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-96 w-full"></div>
            <div className="skeleton h-12 w-full"></div>
          </div>
        ) : (
          <>
            {hasNewImage && currentIndex !== 0 && (
              <div className="alert alert-info mb-4">
                <span>A new image is available!</span>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleUpdateToLatest}
                >
                  View Latest
                </button>
              </div>
            )}

            {currentImage && (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={currentImage.imageUrl}
                    alt="Black Diamond Pool"
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                  <div className="absolute top-4 right-4 badge badge-neutral">
                    {currentImage.isNighttimeInd === 'Y' ? '🌙 Night' : '☀️ Day'}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-base-content/70">
                      {new Date(currentImage.imageTimestamp * 1000).toLocaleString()}
                    </p>
                    <p className="text-sm text-base-content/50">
                      {formatDistanceToNow(new Date(currentImage.imageTimestamp * 1000), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="text-sm text-base-content/70">
                    Image {currentIndex + 1} of {images.length}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <button
                      className="btn btn-circle"
                      onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                    >
                      ←
                    </button>
                    
                    <input
                      type="range"
                      min={0}
                      max={images.length - 1}
                      value={images.length - 1 - currentIndex}
                      onChange={(e) => setCurrentIndex(images.length - 1 - parseInt(e.target.value))}
                      className="range range-primary flex-1"
                    />
                    
                    <button
                      className="btn btn-circle"
                      onClick={() => setCurrentIndex(Math.min(images.length - 1, currentIndex + 1))}
                      disabled={currentIndex === images.length - 1}
                    >
                      →
                    </button>
                  </div>

                  {images.length === loadCount && loadCount < 500 && (
                    <div className="flex items-center gap-4 justify-center">
                      <button
                        className="btn btn-primary"
                        onClick={handleLoadMore}
                      >
                        Load 50 More Images
                      </button>
                      <span className="text-sm text-base-content/70">
                        (Currently showing {loadCount})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default App