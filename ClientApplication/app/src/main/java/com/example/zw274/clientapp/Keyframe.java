package com.example.zw274.clientapp;

import android.util.Log;

import org.opencv.core.Point;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by zw274 on 12/9/2017.
 */

public class Keyframe {
    public int type;
    public float duration;
    // Transform2D fields (type == 0)
    public float translation_x;
    public float translation_y;
    public float rotation;
    // Transform3D fields (type == 1)
    public List<Point> ptp;
    public List<Point> ptq;
    // Color fields (type == 2)
    public float delta_hue;
    // Annotation fields (type == 3)
    public String annotation;

    Keyframe(int type_, float duration_, float translation_x_, float translation_y_,
             float rotation_, double[] pts_, float delta_hue_, String annotation_) {
        type = type_;
        duration = duration_;
        translation_x = translation_x_;
        translation_y = translation_y_;
        ptp = new ArrayList<Point>();
        ptq = new ArrayList<Point>();
        for (int i = 0; i < 8; i += 2) {
            ptp.add(new Point(pts_[i], pts_[i + 1]));
        }
        for (int i = 8; i < 16; i += 2) {
            ptq.add(new Point(pts_[i], pts_[i + 1]));
        }
        rotation = rotation_;
        delta_hue = delta_hue_;
        annotation = annotation_;
    }
}
