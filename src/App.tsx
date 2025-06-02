import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import type { ApiResponse, WebcamInfo } from './types'
import { fetchInterestingImages, fetchWebcamImagesByDays, fetchWebcamImagesByTimestamp } from './api'
import { calculateMissingImageTimestamps, calculateImageStats } from './utils/imageStats'
import { DatePickerModal } from './components/DatePickerModal'
import { JumpToImageModal } from './components/JumpToImageModal'
import { MissingImagesModal } from './components/MissingImagesModal'

function App() {
  const queryClient = useQueryClient()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [inputLoadCount, setInputLoadCount] = useState(50)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [showInterestingOnly, setShowInterestingOnly] = useState(false)
  const [webcamInfo, setWebcamInfo] = useState<WebcamInfo | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showJumpModal, setShowJumpModal] = useState(false)
  const [jumpToImage, setJumpToImage] = useState('')
  const [isJumping, setIsJumping] = useState(false)
  const [showMissingModal, setShowMissingModal] = useState(false)
  const [displayImage, setDisplayImage] = useState<string | null>(null)
  const [isImageLoading, setIsImageLoading] = useState(false)
  const previousImageRef = useRef<string | null>(null)

  // Initial load - last 3 days
  const { 
    data: initialData, 
    isLoading, 
    error,
    refetch: refetchInitial 
  } = useQuery({
    queryKey: ['volcanic-images-initial'],
    queryFn: () => fetchWebcamImagesByDays(3, 50),
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000,
  })

  // Infinite query for pagination
  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['volcanic-images-paginated'],
    initialPageParam: initialData?.images[initialData.images.length - 1]?.imageTimestamp,
    queryFn: ({ pageParam }) => {
      if (!pageParam) return Promise.resolve({ images: [], webcam: webcamInfo!, meta: { imageTotal: 0, firstImageTimestamp: 0, lastImageTimestamp: 0 } })
      return fetchWebcamImagesByTimestamp(0, pageParam - 1, inputLoadCount, 'newestFirst')
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.images.length === 0) return undefined
      return lastPage.images[lastPage.images.length - 1].imageTimestamp
    },
    enabled: !!initialData,
  })

  // Auto-refresh for new images when viewing latest
  useQuery({
    queryKey: ['volcanic-images-new', initialData?.images[0]?.imageTimestamp],
    queryFn: async () => {
      if (!initialData?.images[0]) return []
      const latestTimestamp = initialData.images[0].imageTimestamp
      const data = await fetchWebcamImagesByTimestamp(latestTimestamp + 1, Math.floor(Date.now() / 1000), 10)
      
      if (data.images.length > 0) {
        setToastMessage(`${data.images.length} new image${data.images.length > 1 ? 's' : ''} available!`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
        
        // Update the initial data cache
        queryClient.setQueryData(['volcanic-images-initial'], (old: ApiResponse) => ({
          ...old,
          images: [...data.images, ...old.images].slice(0, 100), // Keep max 100 in initial
        }))
      }
      return data.images
    },
    enabled: currentIndex === 0 && !!initialData,
    refetchInterval: 15 * 60 * 1000, // 15 minutes
  })

  // Combine all images
  const allImages = useMemo(() => {
    const images = [...(initialData?.images || [])]
    
    if (paginatedData) {
      paginatedData.pages.forEach(page => {
        images.push(...page.images)
      })
    }
    
    // Remove duplicates
    const uniqueImages = Array.from(new Map(images.map(img => [img.imageId, img])).values())
    
    // Sort by timestamp descending (newest first)
    uniqueImages.sort((a, b) => b.imageTimestamp - a.imageTimestamp)
    
    return uniqueImages
  }, [initialData, paginatedData])

  // Filter images if needed
  const displayImages = useMemo(() => {
    console.log('[Filter] showInterestingOnly:', showInterestingOnly)
    console.log('[Filter] allImages count:', allImages.length)
    
    if (!showInterestingOnly) {
      console.log('[Filter] Returning all images')
      return allImages
    }
    
    const filtered = allImages.filter(img => img.interestingCode === 'V')
    console.log('[Filter] Filtered to volcanic activity, count:', filtered.length)
    console.log('[Filter] Sample of interesting codes:', allImages.slice(0, 10).map(img => ({ 
      id: img.imageId, 
      code: img.interestingCode,
      timestamp: new Date(img.imageTimestamp * 1000).toLocaleString()
    })))
    
    return filtered
  }, [allImages, showInterestingOnly])

  // Update webcam info
  useEffect(() => {
    if (initialData?.webcam) {
      setWebcamInfo(initialData.webcam)
    }
  }, [initialData])

  // Calculate missing image timestamps first
  const missingImageTimestamps = useMemo(() => calculateMissingImageTimestamps(displayImages), [displayImages])

  // Calculate expected vs actual images based on missing timestamps
  const imageStats = useMemo(() => calculateImageStats(displayImages, missingImageTimestamps), [displayImages, missingImageTimestamps])

  const currentImage = displayImages[currentIndex]
  
  // Handle image loading and retention
  useEffect(() => {
    if (currentImage?.imageUrl) {
      // If this is a different image, start loading process
      if (displayImage !== currentImage.imageUrl) {
        setIsImageLoading(true)
        
        // Create a new image element to preload
        const img = new Image()
        
        img.onload = () => {
          // Store previous image for seamless transition
          previousImageRef.current = displayImage
          setDisplayImage(currentImage.imageUrl)
          setIsImageLoading(false)
        }
        
        img.onerror = () => {
          // If image fails to load, still update display
          previousImageRef.current = displayImage
          setDisplayImage(currentImage.imageUrl)
          setIsImageLoading(false)
        }
        
        img.src = currentImage.imageUrl
      }
    }
  }, [currentImage?.imageUrl, displayImage])
  
  // Initialize display image on first load
  useEffect(() => {
    if (currentImage?.imageUrl && !displayImage) {
      setDisplayImage(currentImage.imageUrl)
    }
  }, [currentImage?.imageUrl, displayImage])
  
  // Log current image state
  useEffect(() => {
    console.log('[Current Image] Index:', currentIndex)
    console.log('[Current Image] Display images count:', displayImages.length)
    console.log('[Current Image] Current image:', currentImage ? {
      id: currentImage.imageId,
      interestingCode: currentImage.interestingCode,
      timestamp: new Date(currentImage.imageTimestamp * 1000).toLocaleString()
    } : 'No image')
  }, [currentIndex, displayImages.length, currentImage])


  const handleLoadMore = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  const handleDateSubmit = async () => {
    if (!startDate) return
    
    let startTimestamp = Math.floor(new Date(startDate).getTime() / 1000)
    const endTimestamp = Math.floor(Date.now() / 1000)
    
    // Validate date is not before earliest available
    if (webcamInfo && startTimestamp < webcamInfo.firstImageTimestamp) {
      const earliestDate = new Date(webcamInfo.firstImageTimestamp * 1000)
      const userConfirm = confirm(
        `The selected date is before the earliest available image (${earliestDate.toLocaleDateString()}). ` +
        `Would you like to load from the earliest date instead?`
      )
      
      if (userConfirm) {
        startTimestamp = webcamInfo.firstImageTimestamp
      } else {
        return // User cancelled
      }
    }
    
    try {
      const data = await fetchWebcamImagesByTimestamp(startTimestamp, endTimestamp, 99999)
      
      if (data.images.length > 0) {
        // Replace initial data with date range data
        queryClient.setQueryData(['volcanic-images-initial'], data)
        setCurrentIndex(0)
        setShowDatePicker(false)
        setStartDate('')
        setToastMessage(`Loaded ${data.images.length} images from ${new Date(startTimestamp * 1000).toLocaleDateString()}`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
      } else {
        alert('No images found since the selected date')
      }
    } catch (err) {
      console.error('Error loading images:', err)
      alert('Error loading images from the selected date')
    }
  }

  const handleRefresh = () => {
    setRetryCount(prev => prev + 1)
    refetchInitial()
  }

  const handleJumpToImage = async () => {
    const imageNumber = parseInt(jumpToImage)
    const totalImages = webcamInfo?.imageTotal || displayImages.length
    
    if (!imageNumber || imageNumber < 1 || imageNumber > totalImages) {
      return
    }

    setIsJumping(true)

    try {
      // Check if the image is already loaded
      if (imageNumber <= displayImages.length) {
        setCurrentIndex(imageNumber - 1)
        setShowJumpModal(false)
        setJumpToImage('')
        setIsJumping(false)
        return
      }

      // Need to fetch more images
      // Calculate how many images we need to load
      const imagesToLoad = imageNumber - displayImages.length + 100 // Load extra for buffer
      
      // Fetch all images from the beginning
      const endTimestamp = Math.floor(Date.now() / 1000)
      const data = await fetchWebcamImagesByTimestamp(0, endTimestamp, Math.min(imagesToLoad, totalImages), 'newestFirst')
      
      if (data.images.length >= imageNumber) {
        // Replace the initial data with all loaded images
        queryClient.setQueryData(['volcanic-images-initial'], data)
        
        // Clear pagination data since we're resetting
        queryClient.resetQueries({ queryKey: ['volcanic-images-paginated'] })
        
        // Set the index after data is loaded
        setTimeout(() => {
          setCurrentIndex(imageNumber - 1)
        }, 100)
        
        setToastMessage(`Loaded ${data.images.length} images`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
      } else {
        setToastMessage(`Could not load image ${imageNumber}. Only ${data.images.length} images available.`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
      }
      
      setShowJumpModal(false)
      setJumpToImage('')
    } catch (err) {
      console.error('Error jumping to image:', err)
      setToastMessage('Error loading images')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 5000)
    } finally {
      setIsJumping(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card bg-base-200 shadow-xl p-8 max-w-md">
          <h2 className="text-xl font-bold mb-4">Error Loading Images</h2>
          <p className="mb-4">{error.message}</p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleRefresh}>
              Retry (Attempt {retryCount + 1})
            </button>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-base-100 p-2 overflow-hidden">
      {showToast && (
        <div className="toast toast-top toast-center">
          <div className="alert alert-success">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto h-full flex flex-col">
        <h1 className="text-2xl font-bold text-center mb-2 flex-shrink-0">
          {webcamInfo?.webcamName} Webcam
        </h1>

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-96 w-full"></div>
            <div className="skeleton h-12 w-full"></div>
          </div>
        ) : (
          <>
            {displayImages.length === 0 && showInterestingOnly ? (
              <div className="card bg-base-200 shadow-xl p-8 text-center">
                <h2 className="text-xl font-bold mb-4">No Volcanic Activity Images Found</h2>
                <p className="mb-4">There are no images marked with volcanic activity in the current dataset.</p>
                <div className="flex gap-4 justify-center">
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      console.log('[No Images] Disabling volcanic activity filter')
                      setShowInterestingOnly(false)
                      setCurrentIndex(0)
                    }}
                  >
                    Show All Images
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={async () => {
                      console.log('[No Images] Loading interesting images from API')
                      try {
                        const data = await fetchInterestingImages(100)
                        if (data.images && data.images.length > 0) {
                          queryClient.setQueryData(['volcanic-images-initial'], data)
                          setToastMessage(`Loaded ${data.images.length} images with volcanic activity`)
                          setShowToast(true)
                          setTimeout(() => setShowToast(false), 5000)
                        } else {
                          setToastMessage('No volcanic activity images found for this webcam')
                          setShowToast(true)
                          setTimeout(() => setShowToast(false), 5000)
                        }
                      } catch (err) {
                        console.error('[No Images] Error loading interesting images:', err)
                        setToastMessage('Error loading volcanic activity images')
                        setShowToast(true)
                        setTimeout(() => setShowToast(false), 5000)
                      }
                    }}
                  >
                    Load Volcanic Activity Images
                  </button>
                </div>
              </div>
            ) : currentImage ? (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    key={displayImage || currentImage.imageId}
                    src={displayImage || currentImage.imageUrl}
                    alt={webcamInfo?.webcamName}
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                  {isImageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg">
                      <span className="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                  )}
                  <div className="absolute top-4 right-4 flex gap-2">
                    {currentImage.interestingCode === 'V' && (
                      <div className="badge badge-warning">🌋 Volcanic Activity</div>
                    )}
                    <div className="badge badge-neutral">
                      {currentImage.isNighttimeInd === 'Y' ? '🌙 Night' : '☀️ Day'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <button
                      onClick={() => setShowDatePicker(true)}
                      className="btn btn-sm btn-ghost text-left"
                    >
                      <div>
                        <p className="text-sm text-base-content/70">
                          {new Date(currentImage.imageTimestamp * 1000).toLocaleString('en-US', { 
                            timeZone: 'America/Denver',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })} MT
                        </p>
                        <p className="text-sm text-base-content/50">
                          {formatDistanceToNow(new Date(currentImage.imageTimestamp * 1000), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                  </div>
                  <div className="text-right">
                    <button
                      onClick={() => setShowJumpModal(true)}
                      className="btn btn-sm btn-ghost text-right"
                    >
                      <div>
                        <p className="text-sm text-base-content/70">
                          Image {currentIndex + 1} of {displayImages.length}
                        </p>
                        {webcamInfo && (
                          <p className="text-sm text-base-content/50">
                            Total available: {webcamInfo.imageTotal.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </button>
                  </div>
                </div>

                {imageStats && (
                  <div className="stats stats-horizontal shadow bg-base-200">
                    <div className="stat px-4 py-2">
                      <div className="stat-title text-xs">Coverage</div>
                      <div className="stat-value text-lg">{imageStats.coverage}%</div>
                    </div>
                    <div className="stat px-4 py-2">
                      <div className="stat-title text-xs">Expected</div>
                      <div className="stat-value text-lg">{imageStats.expected}</div>
                    </div>
                    <div 
                      className="stat px-4 py-2 cursor-pointer hover:bg-base-300 transition-colors"
                      onClick={() => imageStats.missing > 0 && setShowMissingModal(true)}
                    >
                      <div className="stat-title text-xs">Missing</div>
                      <div className="stat-value text-lg">{imageStats.missing}</div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <button
                      className="btn btn-circle"
                      onClick={() => setCurrentIndex(Math.min(displayImages.length - 1, currentIndex + 1))}
                      disabled={currentIndex === displayImages.length - 1}
                    >
                      ←
                    </button>
                    
                    <input
                      type="range"
                      min={0}
                      max={displayImages.length - 1}
                      value={displayImages.length - 1 - currentIndex}
                      onChange={(e) => setCurrentIndex(displayImages.length - 1 - parseInt(e.target.value))}
                      className="range range-primary flex-1"
                    />
                    
                    <button
                      className="btn btn-circle"
                      onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                    >
                      →
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 items-center">
                    <div className="form-control">
                      <label className="label cursor-pointer gap-2">
                        <span className="label-text">Show only volcanic activity</span>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-primary"
                          checked={showInterestingOnly}
                          onChange={(e) => {
                            console.log('[Toggle] Volcanic activity filter changed to:', e.target.checked)
                            setShowInterestingOnly(e.target.checked)
                            setCurrentIndex(0)
                          }}
                        />
                      </label>
                    </div>

                    {hasNextPage && (
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={inputLoadCount}
                          onChange={(e) => {
                            const value = parseInt(e.target.value)
                            // Only allow positive numbers, default to 50 if invalid
                            if (!isNaN(value) && value > 0) {
                              setInputLoadCount(value)
                            } else if (e.target.value === '') {
                              setInputLoadCount(50)
                            }
                          }}
                          className="input input-bordered w-24 text-center"
                        />
                        <button
                          className="btn btn-primary"
                          onClick={handleLoadMore}
                          disabled={isFetchingNextPage}
                        >
                          {isFetchingNextPage ? (
                            <>
                              <span className="loading loading-spinner loading-sm"></span>
                              Loading...
                            </>
                          ) : (
                            `Load ${inputLoadCount} More`
                          )}
                        </button>
                      </div>
                    )}
                    
                    <span className="text-sm text-base-content/70">
                      {showInterestingOnly && ` (${allImages.length} total)`}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <DatePickerModal
        showDatePicker={showDatePicker}
        setShowDatePicker={setShowDatePicker}
        startDate={startDate}
        setStartDate={setStartDate}
        webcamInfo={webcamInfo}
        handleDateSubmit={handleDateSubmit}
      />

      <JumpToImageModal
        showJumpModal={showJumpModal}
        setShowJumpModal={setShowJumpModal}
        jumpToImage={jumpToImage}
        setJumpToImage={setJumpToImage}
        webcamInfo={webcamInfo}
        displayImagesLength={displayImages.length}
        handleJumpToImage={handleJumpToImage}
        isJumping={isJumping}
      />

      <MissingImagesModal
        showMissingModal={showMissingModal}
        setShowMissingModal={setShowMissingModal}
        missingImageTimestamps={missingImageTimestamps}
      />
    </div>
  )
}

export default App