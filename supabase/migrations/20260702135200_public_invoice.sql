CREATE OR REPLACE FUNCTION public.get_public_invoice(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order JSONB;
    v_items JSONB;
    v_profile JSONB;
    v_coupon JSONB;
BEGIN
    -- 1. Fetch order
    SELECT jsonb_build_object(
        'id', o.id,
        'status', o.status,
        'total_price', o.total_price,
        'delivery_charge', o.delivery_charge,
        'created_at', o.created_at,
        'paid_at', o.paid_at,
        'notes', o.notes,
        'tracking_number', o.tracking_number,
        'user_id', o.user_id
    ) INTO v_order
    FROM public.orders o
    WHERE o.id = p_order_id;

    IF v_order IS NULL THEN
        RETURN NULL;
    END IF;

    -- 2. Fetch order items
    SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'file_name', oi.file_name,
        'quantity', oi.quantity,
        'color', oi.color,
        'material', oi.material,
        'quality', oi.quality,
        'infill_percentage', oi.infill_percentage,
        'price', oi.price,
        'weight_grams', oi.weight_grams
      )) INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id;

    -- 3. Fetch profile
    SELECT jsonb_build_object(
        'first_name', p.first_name,
        'last_name', p.last_name,
        'phone', p.phone,
        'address', p.address,
        'email', p.email
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = (v_order->>'user_id')::UUID;

    -- 4. Fetch coupon (if any)
    SELECT jsonb_build_object(
        'code', c.code,
        'discount_type', c.discount_type,
        'discount_value', c.discount_value
    ) INTO v_coupon
    FROM public.orders o
    JOIN public.coupons c ON o.coupon_id = c.id
    WHERE o.id = p_order_id;

    RETURN jsonb_build_object(
        'order', v_order,
        'items', COALESCE(v_items, '[]'::jsonb),
        'profile', v_profile,
        'coupon', v_coupon
    );
END;
$$;
