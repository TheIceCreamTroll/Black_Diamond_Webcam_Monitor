import urllib.request
import json

p = urllib.request.urlopen(r'https://volcview.wr.usgs.gov/ashcam-api/imageApi/webcam/ys-bbsn')
data = json.load(p)
print(data["images"][0])
bigarr = []
for i in data["images"]:
    bigarr.append([i["imageTimestamp"], i["imageUrl"]])
print(bigarr)

l = {"list" : bigarr}

json_string = json.dumps(l)#, indent=4)
with open("out.json", "w") as w:
    w.write(json_string)
