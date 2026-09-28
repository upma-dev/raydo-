import cv2
import numpy as np
import os
import math

# Image paths
combo1_path = r"s:\Raydo\Frontend\public\food_taxi_combo_poster.png"
combo2_path = r"s:\Raydo\Frontend\public\food_taxi_combo_poster2.png"
taxi_img_path = r"s:\Raydo\Frontend\src\assets\cinematic_taxi_moving_night.png"
food_img_path = r"s:\Raydo\Frontend\src\assets\raydo_food_vibrant_plate.png"

output_pub = r"s:\Raydo\Frontend\public\video_food_and_taxi_theme.mp4"
output_ast = r"s:\Raydo\Frontend\src\assets\video_food_and_taxi_theme.mp4"

width, height = 1280, 720
fps = 30
duration_sec = 16
total_frames = fps * duration_sec

def load_and_resize(path):
    if os.path.exists(path):
        img = cv2.imread(path)
        if img is not None:
            return cv2.resize(img, (width, height), interpolation=cv2.INTER_CUBIC)
    return np.zeros((height, width, 3), dtype=np.uint8)

img_combo1 = load_and_resize(combo1_path)
img_combo2 = load_and_resize(combo2_path)
img_taxi = load_and_resize(taxi_img_path)
img_food = load_and_resize(food_img_path)

fourcc = cv2.VideoWriter_fourcc(*'mp4v')
writer_pub = cv2.VideoWriter(output_pub, fourcc, fps, (width, height))
writer_ast = cv2.VideoWriter(output_ast, fourcc, fps, (width, height))

print(f"Generating updated clean {total_frames} frames video without garbled text...")

np.random.seed(101)
particles = [{'x': np.random.randint(0, width), 'y': np.random.randint(0, height),
              'speed': np.random.uniform(2, 5), 'size': np.random.randint(2, 5),
              'color': (0, 196, 255) if np.random.rand() > 0.5 else (0, 138, 255)} for _ in range(70)]

for frame in range(total_frames):
    t = frame / float(total_frames) # 0.0 to 1.0
    
    # 4 Scenes (0.25 each):
    # Scene 1: Taxi Focus (0.00 - 0.25)
    # Scene 2: Food Focus (0.25 - 0.50)
    # Scene 3: Clean Mixed Combo 1 (0.50 - 0.75)
    # Scene 4: Clean Mixed Combo 2 (0.75 - 1.00)

    if t < 0.25:
        st = t / 0.25
        scale = 1.0 + st * 0.07
        M = np.float32([[scale, 0, st*20 - (scale-1)*width/2], [0, scale, -st*10 - (scale-1)*height/2]])
        scene = cv2.warpAffine(img_taxi, M, (width, height))
        
        if st > 0.8:
            alpha = (1.0 - st) / 0.2
            canvas = cv2.addWeighted(scene, alpha, np.zeros_like(scene), 1 - alpha, 0)
        else:
            canvas = scene.copy()

        cv2.putText(canvas, "RAYDO TAXI RIDES", (70, 110), cv2.FONT_HERSHEY_DUPLEX, 1.2, (0, 215, 255), 2, cv2.LINE_AA)
        cv2.putText(canvas, "SMOOTH & RELIABLE CITY TRAVEL", (70, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 1, cv2.LINE_AA)

    elif t < 0.50:
        st = (t - 0.25) / 0.25
        scale = 1.06 - st * 0.06
        M = np.float32([[scale, 0, -st*15 - (scale-1)*width/2], [0, scale, -(scale-1)*height/2]])
        scene = cv2.warpAffine(img_food, M, (width, height))

        if st < 0.2:
            alpha = st / 0.2
            canvas = cv2.addWeighted(scene, alpha, np.zeros_like(scene), 1 - alpha, 0)
        elif st > 0.8:
            alpha = (1.0 - st) / 0.2
            canvas = cv2.addWeighted(scene, alpha, np.zeros_like(scene), 1 - alpha, 0)
        else:
            canvas = scene.copy()

        cv2.putText(canvas, "RAYDO FOOD DELIVERY", (70, 110), cv2.FONT_HERSHEY_DUPLEX, 1.2, (0, 140, 255), 2, cv2.LINE_AA)
        cv2.putText(canvas, "HOT RESTAURANT MEALS TO YOUR DOORSTEP", (70, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 1, cv2.LINE_AA)

    elif t < 0.75:
        st = (t - 0.50) / 0.25
        scale = 1.0 + st * 0.06
        M = np.float32([[scale, 0, st*10 - (scale-1)*width/2], [0, scale, -(scale-1)*height/2]])
        scene = cv2.warpAffine(img_combo1, M, (width, height))

        if st < 0.2:
            alpha = st / 0.2
            canvas = cv2.addWeighted(scene, alpha, np.zeros_like(scene), 1 - alpha, 0)
        elif st > 0.8:
            alpha = (1.0 - st) / 0.2
            canvas = cv2.addWeighted(scene, alpha, np.zeros_like(scene), 1 - alpha, 0)
        else:
            canvas = scene.copy()

        # Connected route pulse line
        y_wave = int(height * 0.8 + math.sin(frame * 0.15) * 12)
        cv2.line(canvas, (0, y_wave), (width, y_wave - 40), (0, 196, 255), 3, cv2.LINE_AA)

        cv2.putText(canvas, "RAYDO FOOD + TAXI SUPER APP", (70, 110), cv2.FONT_HERSHEY_DUPLEX, 1.2, (0, 215, 255), 2, cv2.LINE_AA)
        cv2.putText(canvas, "MOVE. ORDER. EXPLORE.", (70, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 1, cv2.LINE_AA)

    else:
        st = (t - 0.75) / 0.25
        scale = 1.05 - st * 0.05
        M = np.float32([[scale, 0, -st*10 - (scale-1)*width/2], [0, scale, -(scale-1)*height/2]])
        scene = cv2.warpAffine(img_combo2, M, (width, height))

        if st < 0.2:
            alpha = st / 0.2
            canvas = cv2.addWeighted(scene, alpha, np.zeros_like(scene), 1 - alpha, 0)
        else:
            canvas = scene.copy()

        cv2.putText(canvas, "ONE APP FOR ALL YOUR NEEDS", (70, 110), cv2.FONT_HERSHEY_DUPLEX, 1.2, (0, 180, 255), 2, cv2.LINE_AA)
        cv2.putText(canvas, "TAXI RIDES & FAST FOOD DELIVERY", (70, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 1, cv2.LINE_AA)

    # Particle overlay
    for p in particles:
        p['y'] += p['speed']
        if p['y'] > height:
            p['y'] = 0
            p['x'] = np.random.randint(0, width)
        cv2.circle(canvas, (int(p['x']), int(p['y'])), p['size'], p['color'], -1)

    writer_pub.write(canvas)
    writer_ast.write(canvas)

writer_pub.release()
writer_ast.release()
print("Updated clean video generated successfully!")
