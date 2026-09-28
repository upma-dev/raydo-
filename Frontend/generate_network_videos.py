import cv2
import numpy as np
import os
import math

assets_dir = r"s:\Raydo\Frontend\src\assets"
public_dir = r"s:\Raydo\Frontend\public"

# Inputs
highway_img_p = os.path.join(assets_dir, "cinematic_outstation_highway.png")
network_img_p = os.path.join(assets_dir, "cinematic_raydo_network_ecosystem.png")
rider_img_p = os.path.join(assets_dir, "cinematic_food_rider_moving.png")
taxi_img_p = os.path.join(assets_dir, "cinematic_taxi_moving_night.png")
bus_img_p = os.path.join(assets_dir, "cinematic_bus_travel_highway.png")

width, height = 1280, 720
fps = 30
duration = 5
total_frames = fps * duration

def load_and_resize(path):
    if os.path.exists(path):
        img = cv2.imread(path)
        if img is not None:
            return cv2.resize(img, (width, height), interpolation=cv2.INTER_CUBIC)
    return np.zeros((height, width, 3), dtype=np.uint8)

img_highway = load_and_resize(highway_img_p)
img_network = load_and_resize(network_img_p)
img_rider = load_and_resize(rider_img_p)
img_taxi = load_and_resize(taxi_img_p)
img_bus = load_and_resize(bus_img_p)

fourcc = cv2.VideoWriter_fourcc(*'mp4v')

def create_writer(filename):
    pub_path = os.path.join(public_dir, filename)
    ast_path = os.path.join(assets_dir, filename)
    w_pub = cv2.VideoWriter(pub_path, fourcc, fps, (width, height))
    w_ast = cv2.VideoWriter(ast_path, fourcc, fps, (width, height))
    return w_pub, w_ast

print("Rendering 5 Cinematic Videos for One Network Section...")

# -------------------------------------------------------------
# VIDEO 01: HIGHWAY TO CITY AERIAL (network_01_highway_to_city.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("network_01_highway_to_city.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    # Camera rises: highway zooms out, transitions to network
    scale1 = 1.0 + t * 0.1
    M1 = np.float32([[scale1, 0, -(scale1-1)*width/2], [0, scale1, -(scale1-1)*height/2]])
    frame_h = cv2.warpAffine(img_highway, M1, (width, height))
    
    scale2 = 1.15 - t * 0.15
    M2 = np.float32([[scale2, 0, -(scale2-1)*width/2], [0, scale2, -(scale2-1)*height/2]])
    frame_n = cv2.warpAffine(img_network, M2, (width, height))
    
    if t < 0.4:
        canvas = frame_h
    elif t < 0.7:
        alpha = (t - 0.4) / 0.3
        canvas = cv2.addWeighted(frame_h, 1 - alpha, frame_n, alpha, 0)
    else:
        canvas = frame_n

    # Add rising camera motion blur effect
    cv2.line(canvas, (int(width*0.2), int(height*0.9)), (int(width*0.8), int(height*0.1)), (0, 196, 255), 2)
    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Video 01 generated.")

# -------------------------------------------------------------
# VIDEO 02: CITY MOBILITY NETWORK (network_02_city_network.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("network_02_city_network.mp4")
np.random.seed(42)
particles = [{'x': np.random.randint(0, width), 'y': np.random.randint(0, height), 'speed': np.random.uniform(2, 6)} for _ in range(50)]

for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.0 + math.sin(t * math.pi) * 0.05
    M = np.float32([[scale, 0, t*15 - (scale-1)*width/2], [0, scale, -t*10 - (scale-1)*height/2]])
    canvas = cv2.warpAffine(img_network, M, (width, height))

    # Animate yellow/blue connected route lines
    p1 = (150, int(height*0.8))
    p2 = (int(width*0.5), int(height*0.4 + math.sin(t*2*math.pi)*15))
    p3 = (width - 150, int(height*0.2))
    cv2.polylines(canvas, [np.array([p1, p2, p3])], False, (0, 196, 255), 3, cv2.LINE_AA)
    cv2.polylines(canvas, [np.array([(200, 100), p2, (width-200, height-100)])], False, (255, 138, 0), 2, cv2.LINE_AA)

    for p in particles:
        p['y'] += p['speed']
        if p['y'] > height: p['y'] = 0
        cv2.circle(canvas, (int(p['x']), int(p['y'])), 3, (0, 196, 255), -1)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Video 02 generated.")

# -------------------------------------------------------------
# VIDEO 03: FOOD DELIVERY JOURNEY (network_03_food_delivery.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("network_03_food_delivery.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.05 - t * 0.05
    M = np.float32([[scale, 0, -t*25 - (scale-1)*width/2], [0, scale, -(scale-1)*height/2]])
    canvas = cv2.warpAffine(img_rider, M, (width, height))

    # Warm orange/yellow glowing route
    rx = int(width * (0.2 + t * 0.6))
    ry = int(height * 0.65 + math.sin(t * 3 * math.pi) * 10)
    cv2.circle(canvas, (rx, ry), 40, (0, 138, 255), -1)
    canvas = cv2.addWeighted(canvas, 0.92, cv2.warpAffine(img_rider, M, (width, height)), 0.08, 0)
    cv2.line(canvas, (100, int(height*0.7)), (rx, ry), (0, 138, 255), 4, cv2.LINE_AA)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Video 03 generated.")

# -------------------------------------------------------------
# VIDEO 04: TAXI RIDE JOURNEY (network_04_taxi_ride.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("network_04_taxi_ride.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.0 + t * 0.06
    M = np.float32([[scale, 0, t*20 - (scale-1)*width/2], [0, scale, -t*10 - (scale-1)*height/2]])
    canvas = cv2.warpAffine(img_taxi, M, (width, height))

    # Yellow taxi route streak
    sy = int(height * 0.72 + math.sin(t * 2 * math.pi) * 8)
    cv2.line(canvas, (0, sy), (int(width * (0.3 + t * 0.7)), sy - 15), (0, 215, 255), 4, cv2.LINE_AA)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Video 04 generated.")

# -------------------------------------------------------------
# VIDEO 05: BUS + OUTSTATION NETWORK (network_05_bus_travel.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("network_05_bus_travel.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.0 + t * 0.08
    M = np.float32([[scale, 0, -t*15 - (scale-1)*width/2], [0, scale, -t*15 - (scale-1)*height/2]])
    frame_b = cv2.warpAffine(img_bus, M, (width, height))
    
    scale_n = 1.0 + (1-t) * 0.05
    M_n = np.float32([[scale_n, 0, -(scale_n-1)*width/2], [0, scale_n, -(scale_n-1)*height/2]])
    frame_net = cv2.warpAffine(img_network, M_n, (width, height))

    if t < 0.5:
        canvas = frame_b
    else:
        alpha = (t - 0.5) / 0.5
        canvas = cv2.addWeighted(frame_b, 1 - alpha, frame_net, alpha, 0)

    # Wide connecting highway route
    cv2.line(canvas, (0, int(height*0.9)), (width, int(height*0.2)), (245, 66, 104), 3, cv2.LINE_AA)
    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Video 05 generated successfully!")
