import urllib.request
import json

numgrabbed = 2
p = urllib.request.urlopen(f'https://volcview.wr.usgs.gov/ashcam-api/imageApi/webcam/ys-bbsn/1/newestFirst/{numgrabbed}')
newdata = json.load(p)
with open("out.json") as o:
    olddata = json.load(o)

for i in range(numgrabbed - 1, -1, -1):
    img=  newdata["images"][i]
    newtime = img["imageTimestamp"]
    recent = olddata["list"][0][0]

    if int(recent) < int(newtime):
        #we need to add this one in the front
        olddata["list"].insert(0, [img["imageTimestamp"], img["imageUrl"]])
        
        print(f"inserted new tiem {newtime}")


    json_string = json.dumps(olddata)#, indent=4)
    with open("out.json", "w") as w:
       w.write(json_string)
